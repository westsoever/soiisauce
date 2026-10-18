// app/server/security-headers.test.ts
// The headers that make the app page and the API safe to open next to other tabs: no framing (clickjacking), no inline
// script (so an injected one can't run), no referrer leaking note titles, no sniffing.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSoiiApp } from './app'
import { API_HEADERS, buildCsp, CSP, HTML_HEADERS, htmlHeaders } from './security-headers'
import { makeGeneratedFixture } from './test-fixture'

const directive = (name: string, csp: string = CSP): string[] => {
  const hit = csp.split(';').map(d => d.trim().split(/\s+/)).find(d => d[0] === name)
  return hit ? hit.slice(1) : []
}

describe('the page policy (CSP)', () => {
  test('scripts come from soii itself only: no inline, no eval', () => {
    expect(directive('script-src')).toEqual(["'self'"])
  })

  test('nothing may frame the page, and there is no plugin content or <base> / form hijacking', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"])
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('base-uri')).toEqual(["'self'"])
    expect(directive('form-action')).toEqual(["'self'"])
  })

  test('the app talks to its own server only, and frames only its own PDFs (a blob: URL)', () => {
    expect(directive('connect-src')).toEqual(["'self'"])
    expect(directive('frame-src')).toEqual(["'self'", 'blob:'])
  })

  test('fonts and styles come from soii only (the fonts are bundled, docs/privacy.md)', () => {
    expect(directive('style-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(directive('font-src')).toEqual(["'self'", 'data:'])
  })

  test('notes may show images from anywhere (clipped pages, covers), nothing else is open', () => {
    expect(directive('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'https:']))
    expect(directive('default-src')).toEqual(["'self'"])
  })

  test('the HTML headers carry the policy, DENY framing, no sniffing and no referrer', () => {
    expect(HTML_HEADERS['Content-Security-Policy']).toBe(CSP)
    expect(HTML_HEADERS['X-Frame-Options']).toBe('DENY')
    expect(HTML_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    expect(HTML_HEADERS['Referrer-Policy']).toBe('no-referrer')
  })
})

describe('offline mode (SOII_OFFLINE=1)', () => {
  const offline = buildCsp(true)

  test('the default policy is the online one', () => {
    expect(buildCsp(false)).toBe(CSP)
    expect(htmlHeaders(false)).toEqual(HTML_HEADERS)
  })

  test('nothing may be loaded from another host: no remote images, fonts or styles', () => {
    expect(directive('img-src', offline)).toEqual(["'self'", 'data:', 'blob:'])
    expect(directive('font-src', offline)).toEqual(["'self'", 'data:'])
    expect(directive('style-src', offline)).toEqual(["'self'", "'unsafe-inline'"])
    expect(offline).not.toMatch(/https?:|googleapis|gstatic/)
  })

  test('everything else about the policy is unchanged', () => {
    for (const name of ['script-src', 'frame-ancestors', 'frame-src', 'connect-src', 'object-src', 'base-uri', 'form-action', 'default-src']) {
      expect(directive(name, offline)).toEqual(directive(name))
    }
  })

  test('the page headers carry the offline policy', () => {
    expect(htmlHeaders(true)['Content-Security-Policy']).toBe(offline)
    expect(htmlHeaders(true)['X-Frame-Options']).toBe('DENY')
  })
})

describe('index.html keeps the policy true', () => {
  const html = readFileSync(join(import.meta.dir, '..', 'client', 'index.html'), 'utf8')

  test('every script is an external file', () => {
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0])
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag).toMatch(/\ssrc=/)
    expect(html).not.toMatch(/<script\b[^>]*>\s*(?!<\/script)\S/i)
  })

  test('no inline event handlers or javascript: URLs', () => {
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
  })
})

describe('the API headers', () => {
  const dir = makeGeneratedFixture()
  const app = createSoiiApp({ env: {}, generatedDir: dir })
  const get = (path: string) => app.request(`http://localhost:5011${path}`, { headers: { Host: 'localhost:5011' } })

  test('JSON answers cannot be framed, sniffed or cross-origin embedded, and send no referrer', async () => {
    for (const path of ['/api/health', '/api/vault', '/api/capabilities', '/api/notes/missing']) {
      const res = await get(path)
      for (const [k, v] of Object.entries(API_HEADERS)) expect(res.headers.get(k)).toBe(v)
    }
  })

  test('a refused Host gets them too', async () => {
    const res = await app.request('http://evil.example/api/vault', { headers: { Host: 'evil.example' } })
    expect(res.status).toBe(403)
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  test('an attachment keeps its own sandbox policy and gains the rest', async () => {
    const res = await get('/api/files/assets/evil.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })
})
