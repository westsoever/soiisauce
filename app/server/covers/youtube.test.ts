import { expect, test } from 'bun:test'
import { parseYouTubeId, youtubeThumbnail } from './youtube'

test.each([
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']
])('parses %s', (url, id) => {
  expect(parseYouTubeId(url)).toBe(id)
})

test.each([
  ['https://vimeo.com/123456'],
  ['https://www.youtube.com/watch?v=short'],
  ['https://evil.com/watch?v=dQw4w9WgXcQ'],
  ['not a url'],
  ['']
])('rejects %s', url => {
  expect(parseYouTubeId(url)).toBeNull()
})

test('thumbnail', () => {
  expect(youtubeThumbnail('https://youtu.be/dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  expect(youtubeThumbnail('https://vimeo.com/1')).toBeNull()
})
