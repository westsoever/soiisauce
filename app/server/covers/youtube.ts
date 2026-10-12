// YouTube thumbnails need no network call: the video id maps straight to
// i.ytimg.com (spec §11).
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com'
])
const ID = /^[A-Za-z0-9_-]{11}$/

export function parseYouTubeId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!HOSTS.has(u.hostname)) return null
  let id: string | null = null
  if (u.hostname === 'youtu.be') id = u.pathname.split('/')[1] ?? null
  else if (u.pathname === '/watch') id = u.searchParams.get('v')
  else {
    const [, kind, value] = u.pathname.split('/')
    if (kind === 'shorts' || kind === 'embed' || kind === 'live') id = value ?? null
  }
  return id && ID.test(id) ? id : null
}

export function youtubeThumbnail(url: string): string | null {
  const id = parseYouTubeId(url)
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}
