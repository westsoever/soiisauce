// The three GitHub OAuth calls soii needs. fetch is injected so tests never hit GitHub.
import type { SessionUser } from './auth'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('allow_signup', 'false')
  return url.toString()
}

export async function exchangeCode(
  opts: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: FetchLike
): Promise<string> {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: opts.clientId, client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri })
  })
  const data = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null
  if (!res.ok || !data?.access_token) throw new Error(`GitHub token exchange failed: ${data?.error ?? res.status}`)
  return data.access_token
}

export async function fetchGithubUser(token: string, fetchImpl: FetchLike): Promise<SessionUser> {
  const res = await fetchImpl('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'soii' }
  })
  if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`)
  const data = (await res.json()) as { login?: string; avatar_url?: string }
  if (!data.login) throw new Error('GitHub returned a user without a login')
  return { login: data.login, avatarUrl: data.avatar_url ?? null }
}
