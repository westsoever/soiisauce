// app/vault/markdown.test.ts
import { describe, expect, test } from 'bun:test'
import { createLinkResolver } from './links'
import { renderMarkdown, scanMarkdown } from './markdown'

const notes: Record<string, { id: string; title: string; excerpt: string }> = {
  'People/Anna.md': { id: 'People/Anna', title: 'Anna', excerpt: 'Partner.' },
  'Archive/People/Anna.md': { id: 'Archive/People/Anna', title: 'Anna (old)', excerpt: '' },
  'Books/Dune.md': { id: 'Books/Dune', title: 'Dune', excerpt: 'Spice.' },
  'Weird/Café & ? 100%.md': { id: 'Weird/Café & ? 100%', title: 'Café', excerpt: '' },
  'index.md': { id: 'index', title: 'Home', excerpt: '' }
}
const resolve = createLinkResolver([...Object.keys(notes), 'assets/cover.svg', 'assets/huge.svg', 'docs/paper.pdf'])
const opts = {
  fromPath: 'index.md',
  resolve,
  noteInfo: (p: string) => notes[p] ?? null,
  tooLarge: (p: string) => p === 'assets/huge.svg'
}
const render = (md: string) => renderMarkdown(md, opts)

describe('renderMarkdown — links', () => {
  test('a resolved wikilink becomes an in-app link; shortest path wins', () => {
    const r = render('See [[Anna]].')
    expect(r.html).toContain('href="/n/People/Anna"')
    expect(r.html).toContain('class="wikilink"')
    expect(r.html).toContain('data-note="People/Anna"')
    expect(r.html).toContain('>Anna</a>')
    expect(r.outgoing).toEqual(['People/Anna'])
  })

  test('alias, heading and URL-encoded ids', () => {
    const r = render('[[Dune#Plot Summary|the plot]] and [[Café & ? 100%]]')
    expect(r.html).toContain('href="/n/Books/Dune#plot-summary"')
    expect(r.html).toContain('>the plot</a>')
    expect(r.html).toContain('href="/n/Weird/Caf%C3%A9%20%26%20%3F%20100%25"')
  })

  test('a missing wikilink is visibly marked and reported', () => {
    const r = render('[[Ghost]]')
    expect(r.html).toContain('<span class="wikilink-missing" title="No note called Ghost">Ghost</span>')
    expect(r.missing).toEqual(['Ghost'])
  })

  test('markdown links to notes resolve; external links open in a new tab', () => {
    const r = render('[dune](Books/Dune.md) and [site](https://example.com)')
    expect(r.html).toContain('href="/n/Books/Dune"')
    expect(r.html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"')
  })
})

describe('renderMarkdown — embeds', () => {
  test('image embeds with width, recorded as attachments', () => {
    const r = render('![[cover.svg|200]]')
    expect(r.html).toContain('src="/api/files/assets/cover.svg"')
    expect(r.html).toContain('loading="lazy"')
    expect(r.html).toContain('width="200"')
    expect(r.attachments).toEqual(['assets/cover.svg'])
  })

  test('note embeds become link cards (no transclusion)', () => {
    const r = render('![[Dune]]')
    expect(r.html).toContain('class="embed-note"')
    expect(r.html).toContain('<span class="embed-note-title">Dune</span>')
    expect(r.html).toContain('<span class="embed-note-excerpt">Spice.</span>')
  })

  test('PDFs become links; oversize files are named, not linked', () => {
    expect(render('![[paper.pdf]]').html).toContain('href="/api/files/docs/paper.pdf"')
    const big = render('![[huge.svg]]')
    expect(big.html).toContain('file too large for soii')
    expect(big.attachments).toEqual([])
  })

  test('standard relative images resolve', () => {
    expect(render('![c](assets/cover.svg)').html).toContain('src="/api/files/assets/cover.svg"')
  })
})

describe('renderMarkdown — blocks and safety', () => {
  test('callouts', () => {
    const r = render('> [!warning] Careful\n> Hot stove.')
    expect(r.html).toContain('<div class="callout" data-callout="warning">')
    expect(r.html).toContain('<div class="callout-title">Careful</div>')
    expect(r.html).toContain('Hot stove.')
    expect(r.html).not.toContain('[!warning]')
  })

  test('callout without a title uses the type', () => {
    expect(render('> [!tip]\n> Do it.').html).toContain('<div class="callout-title">Tip</div>')
  })

  test('dataview and tasks blocks are labelled, not executed', () => {
    const r = render('```dataview\nTABLE file.name\n```')
    expect(r.html).toContain('data-plugin="dataview"')
    expect(r.html).toContain('Dataview query: not rendered in soii')
    expect(r.html).toContain('TABLE file.name')
  })

  test('raw HTML and scripts are dropped', () => {
    const r = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nok')
    expect(r.html).not.toContain('<script')
    expect(r.html).not.toContain('onerror')
    expect(r.html).toContain('ok')
  })

  test('GFM: tables, task lists, strikethrough', () => {
    const r = render('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~gone~~')
    expect(r.html).toContain('<table>')
    expect(r.html).toContain('type="checkbox"')
    expect(r.html).toContain('<del>gone</del>')
  })

  test('headings get unprefixed ids; code keeps its language class', () => {
    const r = render('## My Heading\n\n```ts\nconst a = 1\n```')
    expect(r.html).toContain('<h2 id="my-heading">')
    expect(r.html).toMatch(/<code class="[^"]*language-ts/)
  })
})

describe('inline tags', () => {
  test('collected from text, not code, links, numbers or URLs', () => {
    const r = render('Reading #Books and #sci-fi/classic. `#not-a-tag` [x #nope](https://a.b) #123 issue#9')
    expect(r.tags.sort()).toEqual(['books', 'sci-fi/classic'])
    expect(r.html).toContain('<span class="tag">#Books</span>')
  })
})

describe('scanMarkdown', () => {
  test('first H1, headings with slugs matching rendered ids, plain text', () => {
    const s = scanMarkdown('# Title\n\nHello [[Anna|my partner]] **bold**.\n\n## Plot Summary\n\n```js\ncode()\n```')
    expect(s.firstH1).toBe('Title')
    expect(s.headings).toEqual([
      { depth: 1, text: 'Title', slug: 'title' },
      { depth: 2, text: 'Plot Summary', slug: 'plot-summary' }
    ])
    expect(s.plainText).toBe('Title Hello my partner bold. Plot Summary')
  })

  test('a base64 blob is just text', () => {
    const s = scanMarkdown('LS0tCmRhdGU6IDIwMjYtMDgtMTAKd2Vla2RheTogTW9uZGF5Cg==')
    expect(s.plainText.startsWith('LS0t')).toBe(true)
    expect(render('LS0tCmRhdGU6IDIwMjYtMDgtMTAK').html).toBe('<p>LS0tCmRhdGU6IDIwMjYtMDgtMTAK</p>')
  })
  test('noteWords counts what the owner wrote: body words outside every heading', () => {
    expect(scanMarkdown('# A long imported book title with many words\n').noteWords).toBe(0)
    expect(scanMarkdown('# Title\n\n## Summary\n\n## Key ideas\n').noteWords).toBe(0)
    // One short Log entry on a book is enough (plan refinement 14).
    expect(scanMarkdown('# Dune\n\n## Log\n\n- 2026-10-12 — Short thought\n').noteWords).toBe(4)
    expect(scanMarkdown('# Title\n\nOne two three.\n\n# Second H1\n').noteWords).toBe(3)
    expect(scanMarkdown('No heading here, just six words').noteWords).toBe(6)
    expect(scanMarkdown('# T\n\n%% private aside %%\n\n```\ncode words\n```\n').noteWords).toBe(0)
    expect(scanMarkdown('').noteWords).toBe(0)
  })
})

describe('private comments', () => {
  const body = 'Open <!-- COMMENTSECRET --> text %%PERCENTSECRET%% end.\n\n%%\nMULTISECRET\n%%\n\nTail.'
  test('scanMarkdown leaves them out of the plain text', () => {
    expect(scanMarkdown(body).plainText).toBe('Open text end. Tail.')
  })
  test('renderMarkdown leaves them out of the HTML', () => {
    const html = render(body).html
    for (const secret of ['COMMENTSECRET', 'PERCENTSECRET', 'MULTISECRET']) expect(html).not.toContain(secret)
    expect(html).toContain('Tail.')
  })
  test('code keeps its %% and <!-- text; an unclosed %% is just text', () => {
    const html = render('`%%keep%%`\n\n```\n<!-- kept -->\n%%also%%\n```\n\n100%% done').html
    expect(html).toContain('%%keep%%')
    expect(html).toContain('&#x3C;!-- kept -->')
    expect(html).toContain('%%also%%')
    expect(html).toContain('100%% done')
  })
})

describe('plugin code blocks', () => {
  test('a dataview fence is labelled as not rendered', () => {
    const html = render('```dataview\nTABLE x\n```').html
    expect(html).toContain('class="plugin-block"')
    expect(html).toContain('Dataview query: not rendered in soii')
  })

  test('fences named after Object.prototype members stay plain code', () => {
    for (const lang of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const html = render(`\`\`\`${lang}\nkeep me\n\`\`\``).html
      expect(html).not.toContain('plugin-block')
      expect(html).not.toContain('not rendered in soii')
      expect(html).not.toContain('native code')
      expect(html).toContain('keep me')
    }
  })
})
