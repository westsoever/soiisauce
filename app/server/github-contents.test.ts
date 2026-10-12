// app/server/github-contents.test.ts
import { describe, expect, test } from 'bun:test'
import { readEnv } from './env'
import type { FetchLike } from './github-oauth'
import { getFile, putFile } from './github-contents'

const env = readEnv({ VAULT_REPO: 'me/vault', VAULT_WRITE_TOKEN: 'ghp_WRITE', VAULT_REF: 'main' })

function recorder(respond: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init })
    return respond(url, init)
  }
  return { fetch, calls }
}

describe('getFile', () => {
  test('decodes base64 content (GitHub wraps it in newlines) and returns the sha', async () => {
    const b64 = Buffer.from('# Anna\n\nCafé ☕\n').toString('base64').replace(/(.{8})/g, '$1\n')
    const { fetch, calls } = recorder(() => Response.json({ sha: 'abc', encoding: 'base64', content: b64 }))
    expect(await getFile(env, '05-Knowledge/People/Anna B.md', fetch)).toEqual({ ok: true, file: { content: '# Anna\n\nCafé ☕\n', sha: 'abc' } })
    expect(calls[0].url).toBe('https://api.github.com/repos/me/vault/contents/05-Knowledge/People/Anna%20B.md?ref=main')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_WRITE')
  })

  test('404 is "no file"; 403 is rejected; a network error is unreachable', async () => {
    expect(await getFile(env, 'a.md', recorder(() => new Response('{}', { status: 404 })).fetch)).toEqual({ ok: true, file: null })
    expect(await getFile(env, 'a.md', recorder(() => new Response('{}', { status: 403 })).fetch)).toMatchObject({ ok: false, reason: 'rejected' })
    const boom: FetchLike = async () => {
      throw new Error('offline')
    }
    expect(await getFile(env, 'a.md', boom)).toMatchObject({ ok: false, reason: 'unreachable' })
  })

  test('a file too large for inline content', async () => {
    expect(await getFile(env, 'a.md', recorder(() => Response.json({ sha: 'x', encoding: 'none', content: '' })).fetch)).toMatchObject({ ok: false, reason: 'too_large' })
  })
})

describe('putFile', () => {
  test('creates without a sha and returns the commit url', async () => {
    const { fetch, calls } = recorder(() => Response.json({ commit: { html_url: 'https://github.com/me/vault/commit/1' } }, { status: 201 }))
    expect(await putFile(env, 'a.md', 'hi', 'soii log: note "a"', null, fetch)).toEqual({ ok: true, commitUrl: 'https://github.com/me/vault/commit/1' })
    const body = JSON.parse(String(calls[0].init.body))
    expect(calls[0].init.method).toBe('PUT')
    expect(body).toEqual({ message: 'soii log: note "a"', content: Buffer.from('hi').toString('base64'), branch: 'main' })
  })

  test('sends the sha when updating', async () => {
    const { fetch, calls } = recorder(() => Response.json({ commit: {} }, { status: 200 }))
    expect(await putFile(env, 'a.md', 'hi', 'm', 'abc', fetch)).toEqual({ ok: true, commitUrl: null })
    expect(JSON.parse(String(calls[0].init.body)).sha).toBe('abc')
  })

  test('422 without a sha means the file exists; 409 or 422 with a sha is a conflict', async () => {
    const r = (status: number) => recorder(() => new Response('{}', { status })).fetch
    expect(await putFile(env, 'a.md', 'x', 'm', null, r(422))).toMatchObject({ ok: false, reason: 'exists' })
    expect(await putFile(env, 'a.md', 'x', 'm', 'abc', r(409))).toMatchObject({ ok: false, reason: 'conflict' })
    expect(await putFile(env, 'a.md', 'x', 'm', 'abc', r(422))).toMatchObject({ ok: false, reason: 'conflict' })
    expect(await putFile(env, 'a.md', 'x', 'm', null, r(403))).toMatchObject({ ok: false, reason: 'rejected' })
    expect(await putFile(env, 'a.md', 'x', 'm', null, r(500))).toMatchObject({ ok: false, reason: 'error', status: 500 })
  })
})
