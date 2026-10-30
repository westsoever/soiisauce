import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { note } from '../../lib/life-test-utils'
import { subprojectMap } from '../../lib/subprojects'
import { ProjectFamily } from './BoardView'

const project = (id: string, frontmatter: Record<string, unknown> = {}) => note(id, { type: 'project', ...frontmatter })

const garden = project('02-Projects/Balcony garden', { status: 'active' })
const beds = project('02-Projects/Raised beds', { status: 'active', parent: '[[Balcony garden]]' })
const legal = project('02-Projects/Legal setup', { status: 'done', parent: '[[Balcony garden]]' })
const notes = [garden, beds, legal]
const render = (n: typeof garden) => renderToStaticMarkup(<ProjectFamily note={n} notes={notes} subprojects={subprojectMap(notes)} />)

describe('ProjectFamily (board card)', () => {
  test('a subproject card links to its parent', () => {
    const html = render(beds)
    expect(html).toContain('href="/n/02-Projects/Balcony%20garden"')
    expect(html).toContain('↳ Balcony garden')
    expect(html).not.toContain('subprojects done')
  })

  test('a parent card says how many subprojects are done', () => {
    const html = render(garden)
    expect(html).toContain('1 of 2 subprojects done')
    expect(html).not.toContain('↳')
  })

  test('a project in neither role, and a non-project with a parent, get nothing', () => {
    expect(render(project('02-Projects/Solo'))).toBe('')
    expect(render(note('Plain', { parent: '[[Balcony garden]]' }))).toBe('')
  })

  test('a subproject with subprojects shows both, and a broken parent shows no label', () => {
    const vesting = project('02-Projects/Vesting', { parent: '[[Raised beds]]' })
    const all = [...notes, vesting]
    const html = renderToStaticMarkup(<ProjectFamily note={beds} notes={all} subprojects={subprojectMap(all)} />)
    expect(html).toContain('↳ Balcony garden')
    expect(html).toContain('0 of 1 subproject done')
    const lost = project('Lost', { parent: '[[Nowhere]]' })
    expect(render(lost)).toBe('')
  })
})
