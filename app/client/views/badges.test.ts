import { describe, expect, test } from 'bun:test'
import type { NoteMeta, TabConfig } from '../../lib/types'
import { todayIn } from '../../lib/feed'
import { tabBadges } from './badges'

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

function note(date: string | null): NoteMeta {
  return {
    id: `r/${date}`,
    title: String(date),
    path: `r/${date}.md`,
    folder: 'r',
    type: 'daily-brief',
    tags: [],
    date,
    updated: null,
    frontmatter: {},
    excerpt: '',
    image: null,
    wordCount: 0
  }
}

const feedTab: TabConfig = { id: 'brief', title: 'Brief', view: 'feed', query: { type: 'daily-brief' } }

describe('tabBadges', () => {
  test('feed tabs get a dot when a note is dated today in the browser zone', () => {
    expect(tabBadges.feed?.([note(todayIn(zone))], feedTab)).toBe(true)
  })
  test('feed tabs get no dot for older notes or none', () => {
    expect(tabBadges.feed?.([note('2001-01-01')], feedTab)).toBe(false)
    expect(tabBadges.feed?.([], feedTab)).toBe(false)
  })
  test('other views have no badge', () => {
    expect(tabBadges.table).toBeUndefined()
    expect(tabBadges.list).toBeUndefined()
  })
})
