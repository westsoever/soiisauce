// scripts/fetch-vault.test.ts
import { describe, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fetchVault, redact, vaultSource, withoutCredentials } from './fetch-vault'

describe('vaultSource', () => {
  test('GitHub repo + token, default ref main, token never in display', () => {
    const s = vaultSource({ VAULT_REPO: 'me/vault', VAULT_TOKEN: 'ghp_secret' })!
    expect(s.url).toBe('https://x-access-token:ghp_secret@github.com/me/vault.git')
    expect(s.ref).toBe('main')
    expect(s.display).toBe('https://***@github.com/me/vault.git')
    expect(s.display).not.toContain('ghp_secret')
  })
  test('VAULT_GIT_URL overrides; VAULT_REF is honoured; nothing set → null', () => {
    expect(vaultSource({ VAULT_GIT_URL: 'https://u:p@gitlab.com/a/b.git', VAULT_REF: 'live' })).toEqual({
      url: 'https://u:p@gitlab.com/a/b.git',
      ref: 'live',
      display: 'https://***@gitlab.com/a/b.git'
    })
    expect(vaultSource({})).toBeNull()
  })
})

describe('redact', () => {
  test('removes credentials anywhere in text', () => {
    expect(redact("fatal: unable to access 'https://x-access-token:abc@github.com/a/b.git/'")).toBe(
      "fatal: unable to access 'https://***@github.com/a/b.git/'"
    )
  })
})

describe('fetchVault', () => {
  test('nothing configured → a clear setup error', () => {
    expect(() => fetchVault({}, join(tmpdir(), 'x'))).toThrow('Set VAULT_PATH (local dev) or VAULT_REPO + VAULT_TOKEN (deploys).')
  })
  test('a failing clone reports the redacted source and git error', () => {
    const dest = join(mkdtempSync(join(tmpdir(), 'soii-fetch-')), 'vault')
    expect(() => fetchVault({ VAULT_GIT_URL: '/nonexistent/repo-for-soii-test' }, dest)).toThrow(/^Couldn't clone \/nonexistent\/repo-for-soii-test: /)
  })
})

describe('redact hardening', () => {
  test('a literal secret is removed wherever it appears', () => {
    expect(redact('oops ghp_SECRET here ghp_SECRET', ['ghp_SECRET'])).toBe('oops *** here ***')
    expect(redact('nothing to hide', [undefined, ''])).toBe('nothing to hide')
  })
  test('userinfo containing @ or / is removed entirely', () => {
    expect(redact('clone https://user:p@ss@host/x.git failed')).toBe('clone https://***@host/x.git failed')
    expect(redact("unable to access 'https://user:pa/ss@host/x.git/'")).toBe("unable to access 'https://***@host/x.git/'")
  })
})

describe('fetchVault git calls', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'soii-fetch-'))
  const withEnv = (vars: Record<string, string>, run: () => void) => {
    const saved = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]))
    Object.assign(process.env, vars)
    try {
      run()
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }
  const fakeGit = (body: string) => {
    const dir = tmp()
    writeFileSync(join(dir, 'git'), `#!/bin/sh\n${body}\n`)
    chmodSync(join(dir, 'git'), 0o755)
    return `${dir}:${process.env.PATH}`
  }

  test('the URL comes after -- so it can never be read as an option', () => {
    const log = join(tmp(), 'argv.log')
    const PATH = fakeGit(`echo "$@" >> '${log}'`)
    withEnv({ PATH }, () => fetchVault({ VAULT_GIT_URL: '--upload-pack=touch /tmp/pwned', VAULT_REF: 'live' }, join(tmp(), 'vault')))
    const clone = readFileSync(log, 'utf8').split('\n')[0]
    expect(clone).toMatch(/--branch live -- --upload-pack=touch \/tmp\/pwned \S+\/vault$/)
  })

  test('the token is scrubbed from git errors', () => {
    const PATH = fakeGit(`echo "fatal: could not read from https://x-access-token:ghp_TOPSECRET@github.com/me/vault.git (ghp_TOPSECRET)" >&2; exit 128`)
    withEnv({ PATH }, () => {
      let message = ''
      try {
        fetchVault({ VAULT_REPO: 'me/vault', VAULT_TOKEN: 'ghp_TOPSECRET' }, join(tmp(), 'vault'))
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toMatch(/^Couldn't clone https:\/\/\*\*\*@github.com\/me\/vault.git: /)
      expect(message).not.toContain('ghp_TOPSECRET')
    })
  })

  test("the clone's own git config never keeps the credentials", () => {
    const src = tmp()
    const sh = (...args: string[]) => Bun.spawnSync(['git', '-C', src, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { stderr: 'pipe' })
    sh('init', '-q', '-b', 'main')
    writeFileSync(join(src, 'a.md'), 'hi')
    sh('add', '.')
    sh('commit', '-q', '-m', 'init')
    const dest = join(tmp(), 'vault')
    // insteadOf lets a credentialled GitHub URL be cloned from the local repo, offline.
    withEnv(
      {
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.file://${src}.insteadOf`,
        GIT_CONFIG_VALUE_0: 'https://x-access-token:ghp_TOPSECRET@github.com/me/vault.git'
      },
      () => fetchVault({ VAULT_REPO: 'me/vault', VAULT_TOKEN: 'ghp_TOPSECRET' }, dest)
    )
    expect(existsSync(join(dest, 'a.md'))).toBe(true)
    expect(readFileSync(join(dest, '.git', 'config'), 'utf8')).not.toContain('ghp_TOPSECRET')
    expect(readFileSync(join(dest, '.git', 'config'), 'utf8')).toContain('https://github.com/me/vault.git')
  })
})

describe('withoutCredentials', () => {
  test('removes userinfo from the authority only', () => {
    expect(withoutCredentials('https://x-access-token:tok@github.com/a/b.git')).toBe('https://github.com/a/b.git')
    expect(withoutCredentials('https://user:p@ss@host/x.git')).toBe('https://host/x.git')
    expect(withoutCredentials('https://TOKEN@github.com/a/b.git')).toBe('https://github.com/a/b.git')
  })
  test('an @ in the path or no credentials leaves the URL alone', () => {
    expect(withoutCredentials('https://github.com/org/repo@v1.git')).toBe('https://github.com/org/repo@v1.git')
    expect(withoutCredentials('file:///tmp/x@y/repo')).toBe('file:///tmp/x@y/repo')
    expect(withoutCredentials('/some/local/path')).toBe('/some/local/path')
  })
})

describe('fetchVault credential helpers and failures', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'soii-fetch-'))
  const withPath = (PATH: string, run: () => void) => {
    const saved = process.env.PATH
    process.env.PATH = PATH
    try {
      run()
    } finally {
      process.env.PATH = saved
    }
  }
  const fakeGit = (body: string) => {
    const dir = tmp()
    writeFileSync(join(dir, 'git'), `#!/bin/sh\n${body}\n`)
    chmodSync(join(dir, 'git'), 0o755)
    return `${dir}:${process.env.PATH}`
  }

  test('clone runs with the credential helper disabled, so nothing stores the token', () => {
    const log = join(tmp(), 'argv.log')
    const PATH = fakeGit(`echo "$@" >> '${log}'`)
    withPath(PATH, () => fetchVault({ VAULT_REPO: 'me/vault', VAULT_TOKEN: 'tok' }, join(tmp(), 'vault')))
    expect(readFileSync(log, 'utf8').split('\n')[0]).toMatch(/^-c credential\.helper= clone /)
  })

  test('if the credentials cannot be removed the clone is deleted, not left behind', () => {
    const dest = join(tmp(), 'vault')
    const PATH = fakeGit(`case "$*" in *" clone "*) for last; do :; done; mkdir -p "$last"; exit 0;; esac; echo "nope tok" >&2; exit 1`)
    withPath(PATH, () => {
      let message = ''
      try {
        fetchVault({ VAULT_REPO: 'me/vault', VAULT_TOKEN: 'tok' }, dest)
      } catch (e) {
        message = (e as Error).message
      }
      expect(message).toMatch(/couldn't remove its credentials/)
      expect(existsSync(dest)).toBe(false)
    })
  })
})
