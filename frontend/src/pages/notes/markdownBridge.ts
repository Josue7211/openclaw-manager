import type { JSONContent } from '@tiptap/core'
import { splitFrontmatter } from './export'

export type ProseMirrorDoc = JSONContent
export { splitFrontmatter }

type InlineNode = NonNullable<JSONContent['content']>[number]

export function markdownToDoc(markdown: string): ProseMirrorDoc {
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

    if (/^---+$/.test(trimmed)) {
      content.push({ type: 'horizontalRule' })
      index += 1
      continue
    }

    const imageEmbed = trimmed.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
    if (imageEmbed && isImagePath(imageEmbed[1])) {
      content.push({
        type: 'image',
        attrs: {
          src: `/api/vault/media?id=${encodeURIComponent(imageEmbed[1].trim())}`,
          alt: imageEmbed[2]?.trim() || imageEmbed[1].trim(),
          title: imageEmbed[1].trim(),
        },
      })
      index += 1
      continue
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
      content.push({
        type: 'blockquote',
        content: markdownToDoc(quote.join('\n')).content || [{ type: 'paragraph' }],
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

export function mergeFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body
  return `${frontmatter}${body}`
}

export function normalizeMarkdownFixture(markdown: string): string {
  return markdown.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

function docContentToMarkdown(content: JSONContent[]): string {
  return content.map(nodeToMarkdown).filter((part) => part.length > 0).join('\n\n')
}

function nodeToMarkdown(node: JSONContent): string {
  const children = node.content || []
  if (node.type === 'heading') return `${'#'.repeat(Number(node.attrs?.level || 1))} ${inlineMarkdown(children)}`
  if (node.type === 'paragraph') return inlineMarkdown(children)
  if (node.type === 'bulletList') return children.map((item) => listItemMarkdown(item, '-')).join('\n')
  if (node.type === 'orderedList') return children.map((item, index) => listItemMarkdown(item, `${index + 1}.`)).join('\n')
  if (node.type === 'taskList') {
    return children.map((item) => {
      const checked = item.attrs?.checked ? 'x' : ' '
      return `- [${checked}] ${inlineMarkdown(item.content?.[0]?.content || [])}`
    }).join('\n')
  }
  if (node.type === 'blockquote') {
    return docContentToMarkdown(children).split('\n').map((line) => `> ${line}`).join('\n')
  }
  if (node.type === 'codeBlock') return `\`\`\`${node.attrs?.language || ''}\n${node.text || inlineMarkdown(children)}\n\`\`\``
  if (node.type === 'horizontalRule') return '---'
  if (node.type === 'image') return imageMarkdown(node)
  if (node.type === 'table') return tableMarkdown(node)
  return inlineMarkdown(children)
}

function listItemMarkdown(item: JSONContent, marker: string): string {
  const first = item.content?.[0]
  return `${marker} ${inlineMarkdown(first?.content || [])}`
}

function inlineContent(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  const pattern = /(!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\])|(!\[([^\]]*)\]\(([^)]+)\))|(\[([^\]]+)\]\(([^)]+)\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*]+\*)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) })
    const raw = match[0]
    if (raw.startsWith('![[')) {
      nodes.push({ type: 'text', text: raw })
    } else if (raw.startsWith('[[')) {
      const target = match[2].trim()
      const label = (match[3] || target).trim()
      nodes.push({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href: `#note:${encodeURIComponent(target)}` } }] })
    } else if (raw.startsWith('![')) {
      nodes.push({ type: 'text', text: raw })
    } else if (raw.startsWith('[')) {
      nodes.push({ type: 'text', text: match[8], marks: [{ type: 'link', attrs: { href: match[9] } }] })
    } else if (raw.startsWith('`')) {
      nodes.push({ type: 'text', text: raw.slice(1, -1), marks: [{ type: 'code' }] })
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
    }
    return text
  }).join('')
}

function imageMarkdown(node: JSONContent): string {
  const src = String(node.attrs?.src || '')
  const alt = String(node.attrs?.alt || 'image')
  const title = String(node.attrs?.title || '')
  if (src.startsWith('/api/vault/media?id=')) {
    const target = decodeURIComponent(src.slice('/api/vault/media?id='.length))
    return alt && alt !== target ? `![[${target}|${alt}]]` : `![[${target}]]`
  }
  return `![${alt}](${src}${title ? ` "${title}"` : ''})`
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
    || /^---+$/.test(trimmed)
    || /^\|.+\|$/.test(trimmed)
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(path.trim())
}
