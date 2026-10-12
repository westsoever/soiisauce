// vercel.json rewrites /api/<rest> to /api/server?__soii_path=<rest>. This puts
// the original path back. searchParams.get() decodes once, so each segment is
// re-encoded once before the app's routes see it.
export function restoreApiPath(request: Request, param = '__soii_path'): Request {
  const url = new URL(request.url)
  const rest = url.searchParams.get(param)
  if (url.pathname !== '/api/server' || rest === null) return request
  url.searchParams.delete(param)
  url.pathname = `/api/${rest.split('/').map(encodeURIComponent).join('/')}`
  return new Request(url, request)
}
