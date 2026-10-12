// app/vault/markdown.ts
// Two passes over a note body: scanMarkdown (title, headings, plain text — no
// link resolution) and renderMarkdown (sanitised HTML with Obsidian syntax).
import GithubSlugger from 'github-slugger'
import type { Root, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { Heading, NoteId } from '../lib/types'
import { remarkObsidian, wikiLabel, type RenderContext } from './remark-obsidian'

type Attr = NonNullable<typeof defaultSchema.attributes>[string][number]
// Element-specific className rules (e.g. code: language-* only) would strip the
// classes we and rehype-highlight add, so drop them and allow className on '*'.
const withoutClassRule = (list: Attr[] = []) => list.filter(a => !(Array.isArray(a) && a[0] === 'className'))

export const SANITIZE_SCHEMA = {
  ...defaultSchema,
  clobber: [],
  clobberPrefix: '',
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'dataNote', 'dataCallout', 'dataPlugin', 'title'],
    a: [...withoutClassRule(defaultSchema.attributes?.a), 'target', 'rel'],
    img: [...(defaultSchema.attributes?.img ?? []), 'alt', 'loading', 'width'],
    code: withoutClassRule(defaultSchema.attributes?.code),
    li: withoutClassRule(defaultSchema.attributes?.li),
    ol: withoutClassRule(defaultSchema.attributes?.ol),
    ul: withoutClassRule(defaultSchema.attributes?.ul)
  }
}

// Obsidian hides %%comments%% and <!-- comments --> in reading view, and owners use
// them for private asides, so drop them before anything is scanned or rendered.
// Fenced and inline code is matched first so its text is left alone.
const COMMENT_OR_CODE = /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n[ \t]*\1[ \t]*(?=\n|$)|$)|`[^`\n]*`|%%[\s\S]*?%%|<!--[\s\S]*?-->/g

export function stripComments(body: string): string {
  return body.replace(COMMENT_OR_CODE, m => (m.startsWith('%%') || m.startsWith('<!--') ? '' : m))
}

const parser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm)

const WIKI_IN_TEXT = /!?\[\[([^[\]\n]+?)\]\]/g
const plain = (s: string) => s.replace(WIKI_IN_TEXT, (_, inner: string) => wikiLabel(inner))

export interface ScanResult {
  firstH1: string | null
  plainText: string
  headings: Heading[]
  /** Body words outside every heading: what the owner wrote (Library "Has my notes"). */
  noteWords: number
}

export function scanMarkdown(body: string): ScanResult {
  const tree = parser.parse(stripComments(body)) as Root
  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  let firstH1: string | null = null
  visit(tree, 'heading', node => {
    const text = plain(toString(node)).trim()
    if (!text) return
    headings.push({ depth: node.depth, text, slug: slugger.slug(text) })
    if (node.depth === 1 && firstH1 === null) firstH1 = text
  })
  const blocks = tree.children.filter((n: RootContent) => n.type !== 'yaml' && n.type !== 'code' && n.type !== 'html')
  const words = (nodes: RootContent[]) =>
    plain(nodes.map(n => toString(n)).join(' '))
      .replace(/\s+/g, ' ')
      .trim()
  const plainText = words(blocks)
  // Headings are structure (the title, a template's "## Summary", the Log's "## Log"), not notes.
  const own = words(blocks.filter(n => n.type !== 'heading'))
  return { firstH1, plainText, headings, noteWords: own ? own.split(' ').length : 0 }
}

export type RenderOptions = Pick<RenderContext, 'fromPath' | 'resolve' | 'noteInfo' | 'tooLarge'>

export interface RenderResult {
  html: string
  outgoing: NoteId[]
  attachments: string[]
  tags: string[]
  missing: string[]
}

export function renderMarkdown(body: string, opts: RenderOptions): RenderResult {
  const ctx: RenderContext = { ...opts, outgoing: new Set(), attachments: new Set(), tags: new Set(), missing: [] }
  const file = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkObsidian, ctx)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeHighlight)
    .use(rehypeSanitize, SANITIZE_SCHEMA)
    .use(rehypeStringify)
    .processSync(stripComments(body))
  return {
    html: String(file).trim(),
    outgoing: [...ctx.outgoing],
    attachments: [...ctx.attachments],
    tags: [...ctx.tags],
    missing: ctx.missing
  }
}
