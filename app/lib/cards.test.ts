import { describe, expect, test } from 'bun:test'
import { cardId, parseCards } from './cards'

const PATH = '03-Areas/Spanish.md'
const fronts = (md: string) => parseCards(md, PATH).map(c => `${c.front} → ${c.back}${c.reverse ? ' (reverse)' : ''}`)

describe('parseCards', () => {
  test('only the ## Cards section counts: :: is one card, ::: two, one each way', () => {
    const md = `# Spanish

- outside :: not a card
status:: active

## Cards

- hola :: hello
- perro ::: dog
* gato :: cat
1. rojo :: red
   - nested :: also a card

## Notes

- after :: not a card
`
    expect(fronts(md)).toEqual(['hola → hello', 'perro → dog', 'dog → perro (reverse)', 'gato → cat', 'rojo → red', 'nested → also a card'])
  })

  test('Dataview fields, code fences, plain lines and half cards give none', () => {
    const md = `## Cards

source:: a Dataview field, not a list item
Just a sentence :: with a separator but no bullet.
- a list item with no separator
- :: no front
- no back ::
\`\`\`
- in a fence :: not a card
## Not a heading in here
\`\`\`
~~~md
- tilde fence :: not a card
~~~
- after the fences :: still in the section
`
    expect(fronts(md)).toEqual(['after the fences → still in the section'])
  })

  test('the section ends at the next # or ## heading, not at ###; a second ## Cards counts too', () => {
    const md = `## Cards
### Verbs
- ser :: to be
# Appendix
- gone :: no
## cards
- tener :: to have
`
    expect(fronts(md)).toEqual(['ser → to be', 'tener → to have'])
  })

  test('a spaced separator wins over colons inside the text; four colons are not a separator', () => {
    const md = `## Cards
- \`std::move\` :: casts to an rvalue
- C++ :: uses std::vector a lot
- Question::Answer
- a::::b
`
    expect(fronts(md)).toEqual(['`std::move` → casts to an rvalue', 'C++ → uses std::vector a lot', 'Question → Answer'])
  })

  test('the same front twice in a note is one card; CRLF files parse', () => {
    expect(fronts('## Cards\r\n- hola :: hello\r\n- Hola  :: hi\r\n')).toEqual(['hola → hello'])
  })
})

describe('cardId', () => {
  test('stays the same when the back is edited, changes when the front is', () => {
    const [before] = parseCards('## Cards\n- hola :: hello\n', PATH)
    const [backEdited] = parseCards('## Cards\n- hola :: hello, hi\n', PATH)
    const [frontEdited] = parseCards('## Cards\n- hola! :: hello\n', PATH)
    expect(backEdited.id).toBe(before.id)
    expect(frontEdited.id).not.toBe(before.id)
    expect(before.id).toBe(cardId(PATH, 'hola'))
    expect(before.id).toMatch(/^03-Areas\/Spanish\.md#[0-9a-f]{8}$/)
  })

  test('case and spacing in the front do not matter; the note path does', () => {
    expect(cardId(PATH, '  Hola   amigo ')).toBe(cardId(PATH, 'hola amigo'))
    expect(cardId('Other.md', 'hola')).not.toBe(cardId(PATH, 'hola'))
  })

  test('the reverse card of a ::: line has its own id', () => {
    const [forward, reverse] = parseCards('## Cards\n- perro ::: dog\n', PATH)
    expect(reverse.id).not.toBe(forward.id)
    expect(reverse.id).toBe(cardId(PATH, 'dog'))
  })
})
