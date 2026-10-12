// app/vault/remark-obsidian.ts
// A remark plugin for Obsidian syntax (spec §7.3): wikilinks, embeds, callouts,
// inline #tags, plugin code blocks, and in-vault markdown links. Custom nodes
// carry data.hName/hProperties so remark-rehype turns them into the HTML the
// reader styles.
import { slug } from 'github-slugger'
import type { Blockquote, Code, Image, Link, Paragraph, PhrasingContent, Root, Text } from 'mdast'
import { posix } from 'node:path'
import { SKIP, visit } from 'unist-util-visit'
import { fileUrl, notePath } from '../lib/paths'
import type { NoteId } from '../lib/types'
import { parseWikiTarget, type LinkResolver } from './links'

export interface RenderContext {
  fromPath: string
  resolve: LinkResolver
  noteInfo: (path: string) => { id: NoteId; title: string; excerpt: string } | null
  tooLarge: (path: string) => boolean
  outgoing: Set<NoteId>
  attachments: Set<string>
  tags: Set<string>
  missing: string[]
}

const WIKI = /(!?)\[\[([^[\]\n]+?)\]\]/g
const TAG = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu
const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i
// A Map, so a fence tagged `constructor` or `__proto__` can't hit Object.prototype.
const PLUGIN_LABELS = new Map([['dataview', 'Dataview query'], ['dataviewjs', 'Dataview query'], ['tasks', 'Tasks query']])

// biome-ignore lint: mdast has no type for our custom nodes; they only need data.hName.
type Custom = any

const text = (value: string): Text => ({ type: 'text', value })

function element(tag: string, className: string, children: PhrasingContent[], props: Record<string, unknown> = {}): Custom {
  return { type: 'soii', data: { hName: tag, hProperties: { className: [className], ...props } }, children }
}

/** What a wikilink shows: its alias, else "Target › Heading", else the target. */
export function wikiLabel(inner: string): string {
  const { target, heading, alias } = parseWikiTarget(inner)
  if (alias) return alias
  if (heading) return target ? `${target} › ${heading}` : heading
  return target
}

function wikilink(inner: string, ctx: RenderContext): PhrasingContent {
  const { target, heading } = parseWikiTarget(inner)
  const label = wikiLabel(inner)
  const resolved = target ? ctx.resolve(target, ctx.fromPath) : ctx.fromPath
  const info = resolved ? ctx.noteInfo(resolved) : null
  if (info) {
    if (info.id !== ctx.noteInfo(ctx.fromPath)?.id) ctx.outgoing.add(info.id)
    const link: Link = {
      type: 'link',
      url: notePath(info.id, heading ? slug(heading) : undefined),
      data: { hProperties: { className: ['wikilink'], dataNote: info.id } },
      children: [text(label)]
    }
    return link
  }
  if (resolved && !ctx.tooLarge(resolved)) {
    // [[file.pdf]] without "!" links to the attachment.
    ctx.attachments.add(resolved)
    return { type: 'link', url: fileUrl(resolved), children: [text(label)] }
  }
  ctx.missing.push(target)
  return element('span', 'wikilink-missing', [text(label)], { title: `No note called ${target}` })
}

function embed(inner: string, ctx: RenderContext): PhrasingContent {
  const { target, alias } = parseWikiTarget(inner)
  const resolved = ctx.resolve(target, ctx.fromPath)
  if (!resolved) {
    ctx.missing.push(target)
    return element('span', 'wikilink-missing', [text(alias ?? target)], { title: `No note called ${target}` })
  }
  const info = ctx.noteInfo(resolved)
  if (info) {
    ctx.outgoing.add(info.id)
    return element(
      'a',
      'embed-note',
      [element('span', 'embed-note-title', [text(info.title)]), element('span', 'embed-note-excerpt', [text(info.excerpt)])],
      { href: notePath(info.id), dataNote: info.id }
    )
  }
  const name = posix.basename(resolved)
  if (ctx.tooLarge(resolved)) return element('span', 'file-too-large', [text(`${name} (file too large for soii)`)])
  ctx.attachments.add(resolved)
  if (IMAGE.test(resolved)) {
    const width = alias && /^\d+(x\d+)?$/.test(alias) ? alias.split('x')[0] : undefined
    const image: Image = {
      type: 'image',
      url: fileUrl(resolved),
      alt: alias && !width ? alias : name,
      data: { hProperties: { loading: 'lazy', ...(width ? { width } : {}) } }
    }
    return image
  }
  return { type: 'link', url: fileUrl(resolved), children: [text(alias ?? name)] }
}

function splitTags(value: string, ctx: RenderContext): PhrasingContent[] {
  const out: PhrasingContent[] = []
  let last = 0
  for (const m of value.matchAll(TAG)) {
    const start = (m.index ?? 0) + m[1].length
    if (start > last) out.push(text(value.slice(last, start)))
    ctx.tags.add(m[2].toLowerCase())
    out.push(element('span', 'tag', [text(`#${m[2]}`)]))
    last = start + 1 + m[2].length
  }
  if (last < value.length) out.push(text(value.slice(last)))
  return out
}

function splitText(value: string, ctx: RenderContext): PhrasingContent[] {
  const out: PhrasingContent[] = []
  let last = 0
  for (const m of value.matchAll(WIKI)) {
    const index = m.index ?? 0
    if (index > last) out.push(...splitTags(value.slice(last, index), ctx))
    out.push(m[1] ? embed(m[2], ctx) : wikilink(m[2], ctx))
    last = index + m[0].length
  }
  if (last < value.length) out.push(...splitTags(value.slice(last), ctx))
  return out
}

function transformBlocks(tree: Root): void {
  tree.children = tree.children.filter(node => node.type !== 'yaml')

  visit(tree, 'code', (node: Code, index, parent) => {
    const lang = node.lang?.toLowerCase()
    const label = lang ? PLUGIN_LABELS.get(lang) : undefined
    if (!label || !parent || index === undefined) return
    const labelNode: Paragraph = { type: 'paragraph', data: { hProperties: { className: ['plugin-label'] } }, children: [text(`${label}: not rendered in soii`)] }
    parent.children[index] = {
      type: 'soii',
      data: { hName: 'div', hProperties: { className: ['plugin-block'], dataPlugin: lang } },
      children: [labelNode, { type: 'code', lang: null, value: node.value }]
    } as Custom
    return SKIP
  })

  visit(tree, 'blockquote', (node: Blockquote) => {
    const first = node.children[0]
    if (first?.type !== 'paragraph') return
    const head = first.children[0]
    if (head?.type !== 'text') return
    const m = /^\[!([\w-]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)/.exec(head.value)
    if (!m) return
    const kind = m[1].toLowerCase()
    const title = m[2].trim() || `${kind[0].toUpperCase()}${kind.slice(1)}`
    head.value = head.value.slice(m[0].length)
    if (!head.value) first.children.shift()
    if (first.children[0]?.type === 'break') first.children.shift()
    if (first.children.length === 0) node.children.shift()
    node.data = { hName: 'div', hProperties: { className: ['callout'], dataCallout: kind } } as Custom
    const titleNode: Paragraph = { type: 'paragraph', data: { hName: 'div', hProperties: { className: ['callout-title'] } } as Custom, children: [text(title)] }
    node.children.unshift(titleNode)
  })
}

function transformLinks(tree: Root, ctx: RenderContext): void {
  visit(tree, (node, index, parent) => {
    if (node.type !== 'link' && node.type !== 'image') return
    const target = node as Link | Image
    const url = target.url
    if (!url || url.startsWith('#')) return
    if (SCHEME.test(url)) {
      if (node.type === 'link' && /^https?:/i.test(url)) {
        target.data = { ...target.data, hProperties: { ...(target.data?.hProperties ?? {}), target: '_blank', rel: ['noopener', 'noreferrer'] } }
      }
      return
    }
    let decoded = url
    try {
      decoded = decodeURI(url)
    } catch {
      // keep the raw url
    }
    const [pathPart, hash] = decoded.split('#', 2)
    const resolved = ctx.resolve(pathPart, ctx.fromPath)
    if (!resolved) return
    const info = ctx.noteInfo(resolved)
    if (info) {
      ctx.outgoing.add(info.id)
      target.url = notePath(info.id, hash ? slug(hash) : undefined)
      if (node.type === 'link') target.data = { ...target.data, hProperties: { className: ['wikilink'], dataNote: info.id } }
      return
    }
    if (ctx.tooLarge(resolved)) {
      if (parent && index !== undefined) {
        parent.children[index] = element('span', 'file-too-large', [text(`${posix.basename(resolved)} (file too large for soii)`)])
      }
      return
    }
    ctx.attachments.add(resolved)
    target.url = fileUrl(resolved)
    if (node.type === 'image') target.data = { ...target.data, hProperties: { ...(target.data?.hProperties ?? {}), loading: 'lazy' } }
  })
}

function transformText(tree: Root, ctx: RenderContext): void {
  visit(tree, 'text', (node: Text, index, parent) => {
    if (!parent || index === undefined) return
    if (parent.type === 'link' || parent.type === 'linkReference') return
    const pieces = splitText(node.value, ctx)
    parent.children.splice(index, 1, ...(pieces as never[]))
    return [SKIP, index + pieces.length]
  })
}

export function remarkObsidian(ctx: RenderContext) {
  return (tree: Root) => {
    transformBlocks(tree)
    transformLinks(tree, ctx)
    transformText(tree, ctx)
  }
}
