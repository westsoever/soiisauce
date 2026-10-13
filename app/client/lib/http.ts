// app/client/lib/http.ts
// JSON calls to soii's API. The session rides in the HttpOnly soii_session
// cookie, so there's no token handling here.
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const body = data as { error?: string; message?: string } | null
    throw new HttpError(body?.message ?? body?.error ?? `Request failed (${res.status})`, res.status, data)
  }
  return data as T
}

/** A binary response (the compiled PDF). Errors carry the JSON body like api() does. */
export async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { credentials: 'same-origin' })
  if (res.ok) return res.blob()
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
  throw new HttpError(body?.message ?? body?.error ?? `Request failed (${res.status})`, res.status, body)
}
