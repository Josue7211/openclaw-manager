import type { JSONContent } from '@tiptap/core'
import type { VaultNote } from '@/features/notes/types'
import { splitFrontmatter } from './export'
import { noteEmbedPreviewForTarget } from './noteLinkPreview'

export type ProseMirrorDoc = JSONContent
export { splitFrontmatter }

type InlineNode = NonNullable<JSONContent['content']>[number]
type TextAlignment = 'center' | 'right' | 'justify'
interface BlockStyles {
  textAlign?: TextAlignment
  lineHeight?: string
}
const PAGE_BREAK_MARKDOWN = '<!-- pagebreak -->'
const TOC_START_MARKER = '<!-- toc:start -->'
const TOC_END_MARKER = '<!-- toc:end -->'

interface TocHeading {
  level: number
  text: string
  slug: string
}

interface CalloutHeader {
  type: string
  title: string
  fold: 'collapsed' | 'expanded' | null
  bodyStart: number
}

export interface MarkdownToDocOptions {
  noteEmbeds?: {
    notes: VaultNote[]
    currentId: string
  }
}

export function markdownToDoc(markdown: string, options: MarkdownToDocOptions = {}): ProseMirrorDoc {
  const { body } = splitFrontmatter(markdown)
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const content: JSONContent[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const styledBlock = parseStyledHtmlBlock(trimmed)
    if (styledBlock) {
      content.push(styledBlock)
      index += 1
      continue
    }

    const fence = line.match(/^```(\w+)?\s*$/)
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      content.push({
        type: 'codeBlock',
        attrs: fence[1] ? { language: fence[1] } : {},
        content: code.length ? [{ type: 'text', text: code.join('\n') }] : undefined,
      })
      continue
    }

    if (/^\|.+\|$/.test(trimmed) && index + 1 < lines.length && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())) {
      const rows: string[][] = [splitTableRow(trimmed)]
      index += 2
      while (index < lines.length && /^\|.+\|$/.test(lines[index].trim())) {
        rows.push(splitTableRow(lines[index].trim()))
        index += 1
      }
      content.push(tableNode(rows))
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: Math.min(heading[1].length, 3) },
        content: inlineContent(heading[2]),
      })
      index += 1
      continue
    }

    if (isPageBreakLine(trimmed)) {
      content.push({ type: 'pageBreak' })
      index += 1
      continue
    }

    if (/^---+$/.test(trimmed)) {
      content.push({ type: 'horizontalRule' })
      index += 1
      continue
    }

    const embed = trimmed.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
    if (embed) {
      if (isImagePath(embed[1])) {
        const image = parseObsidianImageParts(embed[1], embed[2])
        content.push({
          type: 'image',
          attrs: {
            src: `/api/vault/local/media?id=${encodeURIComponent(image.target)}`,
            alt: image.alt || image.target,
            title: image.target,
            width: image.width,
          },
        })
        index += 1
        continue
      }

      const noteEmbed = options.noteEmbeds
        ? noteEmbedPreviewForTarget(embed[1], options.noteEmbeds.notes, options.noteEmbeds.currentId)
        : null
      if (noteEmbed) {
        content.push({
          type: 'noteEmbed',
          attrs: {
            target: noteEmbed.target,
            title: noteEmbed.title,
            body: noteEmbed.body,
          },
        })
        index += 1
        continue
      }
    }

    if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: JSONContent[] = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+\[([ xX])\]\s+(.+)$/)
        if (!item) break
        items.push({
          type: 'taskItem',
          attrs: { checked: item[1].toLowerCase() === 'x' },
          content: [{ type: 'paragraph', content: inlineContent(item[2]) }],
        })
        index += 1
      }
      content.push({ type: 'taskList', content: items })
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: JSONContent[] = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+(.+)$/)
        if (!item || /^[-*]\s+\[[ xX]\]\s+/.test(lines[index].trim())) break
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineContent(item[1]) }] })
        index += 1
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: JSONContent[] = []
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+\.\s+(.+)$/)
        if (!item) break
        items.push({ type: 'listItem', content: [{ type: 'paragraph', content: inlineContent(item[1]) }] })
        index += 1
      }
      content.push({ type: 'orderedList', attrs: { start: 1 }, content: items })
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      const callout = parseCalloutHeader(quote)
      if (callout) {
        content.push({
          type: 'blockquote',
          attrs: {
            calloutType: callout.type,
            calloutTitle: callout.title,
            calloutFold: callout.fold,
          },
          content: markdownToDoc(quote.slice(callout.bodyStart).join('\n'), options).content || [{ type: 'paragraph' }],
        })
        continue
      }
      content.push({
        type: 'blockquote',
        content: markdownToDoc(quote.join('\n'), options).content || [{ type: 'paragraph' }],
      })
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index])
      index += 1
    }
    content.push({ type: 'paragraph', content: inlineContent(paragraph.join(' ')) })
  }

  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

export function docToMarkdown(doc: ProseMirrorDoc, frontmatter = ''): string {
  const body = docContentToMarkdown(doc.content || []).replace(/\n{3,}/g, '\n\n').trimEnd()
  return mergeFrontmatter(frontmatter, body)
}

function mergeFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body
  return `${frontmatter}${body}`
}

export function normalizeMarkdownFixture(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

export function upsertMarkdownTableOfContents(markdown: string): string {
  const { frontmatter, body } = splitFrontmatter(markdown)
  const headings = collectTocHeadings(body)
  const toc = renderTableOfContents(headings)
  const nextBody = replaceExistingTableOfContents(body, toc) ?? insertTableOfContents(body, toc)
  return mergeFrontmatter(frontmatter, nextBody.trimEnd())
}

function docContentToMarkdown(content: JSONContent[]): string {
  return content.map(nodeToMarkdown).filter((part) => part.length > 0).join('\n\n')
}

function nodeToMarkdown(node: JSONContent): string {
  const children = node.content || []
  if (node.type === 'heading') {
    const level = Number(node.attrs?.level || 1)
    return styledBlockMarkdown(node, `h${level}`, inlineMarkdown(children)) ?? `${'#'.repeat(level)} ${inlineMarkdown(children)}`
  }
  if (node.type === 'paragraph') return styledBlockMarkdown(node, 'p', inlineMarkdown(children)) ?? inlineMarkdown(children)
  if (node.type === 'bulletList') return children.map((item) => listItemMarkdown(item, '-')).join('\n')
  if (node.type === 'orderedList') return children.map((item, index) => listItemMarkdown(item, `${index + 1}.`)).join('\n')
  if (node.type === 'taskList') {
    return children.map((item) => {
      const checked = item.attrs?.checked ? 'x' : ' '
      return `- [${checked}] ${inlineMarkdown(item.content?.[0]?.content || [])}`
    }).join('\n')
  }
  if (node.type === 'blockquote') {
    const calloutType = sanitizeCalloutType(String(node.attrs?.calloutType || ''))
    if (calloutType) {
      const title = String(node.attrs?.calloutTitle || calloutType).trim()
      const fold = node.attrs?.calloutFold === 'collapsed'
        ? '-'
        : node.attrs?.calloutFold === 'expanded'
          ? '+'
          : ''
      const body = docContentToMarkdown(children).trim()
      const bodyLines = body ? body.split('\n') : []
      const lines = [`[!${calloutType}]${fold}${title ? ` ${title}` : ''}`, ...bodyLines]
      return lines.map((line) => `> ${line}`).join('\n')
    }
    return docContentToMarkdown(children).split('\n').map((line) => `> ${line}`).join('\n')
  }
  if (node.type === 'codeBlock') return `\`\`\`${node.attrs?.language || ''}\n${node.text || inlineMarkdown(children)}\n\`\`\``
  if (node.type === 'pageBreak') return PAGE_BREAK_MARKDOWN
  if (node.type === 'horizontalRule') return '---'
  if (node.type === 'image') return imageMarkdown(node)
  if (node.type === 'noteEmbed') return noteEmbedMarkdown(node)
  if (node.type === 'table') return tableMarkdown(node)
  return inlineMarkdown(children)
}

function listItemMarkdown(item: JSONContent, marker: string): string {
  const first = item.content?.[0]
  return `${marker} ${inlineMarkdown(first?.content || [])}`
}

function parseCalloutHeader(lines: string[]): CalloutHeader | null {
  const header = lines[0]?.match(/^\s*\[!([A-Za-z][\w-]*)\]([+-])?\s*(.*?)\s*$/)
  if (!header) return null
  const type = sanitizeCalloutType(header[1])
  if (!type) return null
  return {
    type,
    title: header[3].trim() || type,
    fold: header[2] === '-' ? 'collapsed' : header[2] === '+' ? 'expanded' : null,
    bodyStart: 1,
  }
}

function sanitizeCalloutType(type: string): string {
  return type.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32)
}

function parseStyledHtmlBlock(line: string): JSONContent | null {
  const block = line.match(/^<(p|h[1-3])\s+style=["']([^"']*(?:text-align|line-height)[^"']*)["']>(.*)<\/\1>$/i)
  if (!block) return null
  const tag = block[1].toLowerCase()
  const styles = blockStyles(block[2])
  const text = block[3].trim()
  if (!styles.textAlign && !styles.lineHeight) return null
  if (tag === 'p') {
    return {
      type: 'paragraph',
      attrs: {
        ...(styles.textAlign ? { textAlign: styles.textAlign } : {}),
        ...(styles.lineHeight ? { lineHeight: styles.lineHeight } : {}),
      },
      content: inlineContent(text),
    }
  }
  return {
    type: 'heading',
    attrs: {
      level: Number(tag.slice(1)),
      ...(styles.textAlign ? { textAlign: styles.textAlign } : {}),
      ...(styles.lineHeight ? { lineHeight: styles.lineHeight } : {}),
    },
    content: inlineContent(text),
  }
}

function styledBlockMarkdown(node: JSONContent, tag: string, body: string): string | null {
  const styles = blockStyleAttr(node)
  if (!styles) return null
  return `<${tag} style="${styles}">${body}</${tag}>`
}

function blockStyles(style: string): BlockStyles {
  const alignment = style.match(/text-align:\s*(center|right|justify)/i)?.[1]?.toLowerCase()
  const lineHeight = style.match(/line-height:\s*(\d(?:\.\d{1,2})?)/i)?.[1]
  return {
    ...(alignment === 'center' || alignment === 'right' || alignment === 'justify' ? { textAlign: alignment } : {}),
    ...(lineHeight ? { lineHeight } : {}),
  }
}

function blockStyleAttr(node: JSONContent): string | null {
  const styles: string[] = []
  const alignment = alignmentAttr(node)
  if (alignment) styles.push(`text-align: ${alignment}`)
  const lineHeight = lineHeightAttr(node)
  if (lineHeight) styles.push(`line-height: ${lineHeight}`)
  return styles.length ? styles.join('; ') : null
}

function alignmentAttr(node: JSONContent): TextAlignment | null {
  const alignment = node.attrs?.textAlign
  if (alignment === 'center' || alignment === 'right' || alignment === 'justify') return alignment
  return null
}

function lineHeightAttr(node: JSONContent): string | null {
  const lineHeight = node.attrs?.lineHeight
  if (typeof lineHeight === 'string' && /^\d(?:\.\d{1,2})?$/.test(lineHeight)) return lineHeight
  return null
}

function inlineContent(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  const pattern =
    /(!?\[\[[^\]]+\]\])|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(<span\s+style="[^"]*(?:color|font-size|font-family):[^"]*">[^<]+<\/span>)|(<mark(?:\s+data-color="#[0-9a-fA-F]{3,8}")?(?:\s+style="background-color:\s*#[0-9a-fA-F]{3,8};?")?>[^<]+<\/mark>)|(<sup>[^<]+<\/sup>)|(<sub>[^<]+<\/sub>)|(<u>[^<]+<\/u>)|(==[^=]+==)|(`[^`]+`)|(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*]+\*)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) })
    const raw = match[0]
    if (raw.startsWith('![[')) {
      nodes.push({ type: 'text', text: raw })
    } else if (raw.startsWith('[[')) {
      const wikilink = raw.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
      const target = (wikilink?.[1] || raw.slice(2, -2)).trim()
      const label = (wikilink?.[2] || target).trim()
      nodes.push({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: `#note:${encodeURIComponent(target)}` } }] })
    } else if (raw.startsWith('![')) {
      nodes.push({ type: 'text', text: raw })
    } else if (raw.startsWith('[')) {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      nodes.push({ type: 'text', text: link?.[1] || raw, marks: [{ type: 'link', attrs: { href: link?.[2] || '' } }] })
    } else if (raw.startsWith('<span')) {
      const value = raw.replace(/^<span[^>]*>/, '').replace(/<\/span>$/, '')
      const attrs = spanStyleAttrs(raw)
      nodes.push({ type: 'text', text: value, marks: Object.keys(attrs).length ? [{ type: 'textStyle', attrs }] : undefined })
    } else if (raw.startsWith('<mark')) {
      const color = raw.match(/(?:data-color|background-color):?\s*=?["']?(#[0-9a-fA-F]{3,8})/)?.[1]
      const value = raw.replace(/^<mark[^>]*>/, '').replace(/<\/mark>$/, '')
      nodes.push({ type: 'text', text: value, marks: [{ type: 'highlight', attrs: color ? { color } : {} }] })
    } else if (raw.startsWith('<sup>')) {
      nodes.push({ type: 'text', text: raw.slice(5, -6), marks: [{ type: 'superscript' }] })
    } else if (raw.startsWith('<sub>')) {
      nodes.push({ type: 'text', text: raw.slice(5, -6), marks: [{ type: 'subscript' }] })
    } else if (raw.startsWith('<u>')) {
      nodes.push({ type: 'text', text: raw.slice(3, -4), marks: [{ type: 'underline' }] })
    } else if (raw.startsWith('==')) {
      nodes.push({ type: 'text', text: raw.slice(2, -2), marks: [{ type: 'highlight' }] })
    } else if (raw.startsWith('`')) {
      nodes.push({ type: 'text', text: raw.slice(1, -1), marks: [{ type: 'code' }] })
    } else if (raw.startsWith('***')) {
      nodes.push({ type: 'text', text: raw.slice(3, -3), marks: [{ type: 'bold' }, { type: 'italic' }] })
    } else if (raw.startsWith('**')) {
      nodes.push({ type: 'text', text: raw.slice(2, -2), marks: [{ type: 'bold' }] })
    } else if (raw.startsWith('~~')) {
      nodes.push({ type: 'text', text: raw.slice(2, -2), marks: [{ type: 'strike' }] })
    } else if (raw.startsWith('*')) {
      nodes.push({ type: 'text', text: raw.slice(1, -1), marks: [{ type: 'italic' }] })
    }
    last = pattern.lastIndex
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes.length ? nodes : []
}

function inlineMarkdown(content: JSONContent[]): string {
  return content.map((node) => {
    if (node.type === 'image') return imageMarkdown(node)
    let text = node.text || inlineMarkdown(node.content || [])
    for (const mark of node.marks || []) {
      if (mark.type === 'link') {
        const href = String(mark.attrs?.href || '')
        if (href.startsWith('#note:')) {
          const target = decodeURIComponent(href.slice('#note:'.length))
          text = text === target ? `[[${target}]]` : `[[${target}|${text}]]`
        } else {
          text = `[${text}](${href})`
        }
      }
      if (mark.type === 'code') text = `\`${text}\``
      if (mark.type === 'bold') text = `**${text}**`
      if (mark.type === 'italic') text = `*${text}*`
      if (mark.type === 'strike') text = `~~${text}~~`
      if (mark.type === 'underline') text = `<u>${text}</u>`
      if (mark.type === 'superscript') text = `<sup>${text}</sup>`
      if (mark.type === 'subscript') text = `<sub>${text}</sub>`
      if (mark.type === 'highlight') {
        const color = typeof mark.attrs?.color === 'string' ? mark.attrs.color : ''
        text = color ? `<mark data-color="${color}" style="background-color: ${color}">${text}</mark>` : `==${text}==`
      }
      if (mark.type === 'textStyle') {
        const style = textStyleAttr(mark.attrs)
        if (style) text = `<span style="${style}">${text}</span>`
      }
    }
    return text
  }).join('')
}

function spanStyleAttrs(raw: string): Record<string, string> {
  const color = raw.match(/color:\s*(#[0-9a-fA-F]{3,8})/)?.[1]
  const fontSize = raw.match(/font-size:\s*(\d{1,3}px)/i)?.[1]
  const fontFamily = raw.match(/font-family:\s*([^;"]+)/i)?.[1]?.trim()
  return {
    ...(color ? { color } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(fontFamily ? { fontFamily } : {}),
  }
}

function textStyleAttr(attrs: Record<string, unknown> | undefined): string {
  const styles: string[] = []
  if (typeof attrs?.color === 'string' && attrs.color) styles.push(`color: ${attrs.color}`)
  if (typeof attrs?.fontSize === 'string' && attrs.fontSize) styles.push(`font-size: ${attrs.fontSize}`)
  if (typeof attrs?.fontFamily === 'string' && attrs.fontFamily) styles.push(`font-family: ${attrs.fontFamily}`)
  return styles.join('; ')
}

function imageMarkdown(node: JSONContent): string {
  const src = String(node.attrs?.src || '')
  const alt = String(node.attrs?.alt || 'image')
  const title = String(node.attrs?.title || '')
  const mediaPrefix = src.startsWith('/api/vault/local/media?id=')
    ? '/api/vault/local/media?id='
    : src.startsWith('/api/vault/media?id=')
      ? '/api/vault/media?id='
      : ''
  if (mediaPrefix) {
    const target = decodeURIComponent(src.slice(mediaPrefix.length))
    const width = normalizeImageWidth(node.attrs?.width)
    if (width && alt && alt !== target) return `![[${target}|${alt}|${width}]]`
    if (width) return `![[${target}|${width}]]`
    return alt && alt !== target ? `![[${target}|${alt}]]` : `![[${target}]]`
  }
  return `![${alt}](${src}${title ? ` "${title}"` : ''})`
}

function noteEmbedMarkdown(node: JSONContent): string {
  const target = String(node.attrs?.target || '').trim()
  return target ? `![[${target}]]` : ''
}

function parseObsidianImageParts(target: string, rawMeta = ''): { target: string; alt: string; width?: number } {
  const parts = rawMeta.split('|').map((part) => part.trim()).filter(Boolean)
  const firstWidth = parts.find((part) => normalizeImageWidth(part))
  const alt = parts.find((part) => part !== firstWidth) || ''
  return {
    target: target.trim(),
    alt,
    width: normalizeImageWidth(firstWidth),
  }
}

function normalizeImageWidth(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return clampImageWidth(value)
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^(\d{2,4})(?:px)?(?:x\d{2,4})?$/i)
  return match ? clampImageWidth(Number(match[1])) : undefined
}

function clampImageWidth(value: number): number {
  return Math.max(80, Math.min(1400, Math.round(value)))
}

function tableNode(rows: string[][]): JSONContent {
  return {
    type: 'table',
    content: rows.map((row, rowIndex) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: inlineContent(cell) }],
      })),
    })),
  }
}

function tableMarkdown(node: JSONContent): string {
  const rows = (node.content || []).map((row) =>
    (row.content || []).map((cell) => inlineMarkdown(cell.content?.[0]?.content || [])),
  )
  if (!rows.length) return ''
  const header = rows[0]
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function splitTableRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim()
  return /^(#{1,6})\s+/.test(line)
    || /^```/.test(line)
    || /^[-*]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || /^>\s?/.test(line)
    || isPageBreakLine(trimmed)
    || /^---+$/.test(trimmed)
    || /^\|.+\|$/.test(trimmed)
}

function isPageBreakLine(trimmed: string): boolean {
  return trimmed === PAGE_BREAK_MARKDOWN || trimmed === '[[pagebreak]]'
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(path.trim())
}

function collectTocHeadings(markdown: string): TocHeading[] {
  const slugs = new Map<string, number>()
  const headings: TocHeading[] = []
  let seenHeading = false
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const level = Math.min(match[1].length, 6)
    const text = stripInlineMarkdown(match[2]).trim()
    if (!text || /^table of contents$/i.test(text)) continue
    if (!seenHeading && level === 1) {
      seenHeading = true
      continue
    }
    seenHeading = true
    const baseSlug = slugifyHeading(text) || 'section'
    const count = slugs.get(baseSlug) || 0
    slugs.set(baseSlug, count + 1)
    headings.push({
      level,
      text,
      slug: count > 0 ? `${baseSlug}-${count}` : baseSlug,
    })
  }
  return headings
}

function renderTableOfContents(headings: TocHeading[]): string {
  const baseLevel = headings.reduce((level, heading) => Math.min(level, heading.level), 6)
  const entries = headings.length
    ? headings.map((heading) => `${'  '.repeat(Math.max(0, heading.level - baseLevel))}- [${escapeTocLabel(heading.text)}](#${heading.slug})`).join('\n')
    : '- No headings yet'
  return `${TOC_START_MARKER}\n${entries}\n${TOC_END_MARKER}`
}

function replaceExistingTableOfContents(markdown: string, toc: string): string | null {
  const pattern = new RegExp(`${escapeRegExp(TOC_START_MARKER)}[\\s\\S]*?${escapeRegExp(TOC_END_MARKER)}`)
  return pattern.test(markdown) ? markdown.replace(pattern, toc) : null
}

function insertTableOfContents(markdown: string, toc: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const firstHeadingIndex = lines.findIndex((line) => /^#\s+/.test(line))
  if (firstHeadingIndex >= 0) {
    const insertAt = firstHeadingIndex + 1
    while (lines[insertAt] === '') lines.splice(insertAt, 1)
    lines.splice(insertAt, 0, '', '## Table of Contents', '', toc, '')
    return lines.join('\n')
  }
  const body = markdown.trim()
  return body ? `## Table of Contents\n\n${toc}\n\n${body}` : `## Table of Contents\n\n${toc}`
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) => label || target)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function escapeTocLabel(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
