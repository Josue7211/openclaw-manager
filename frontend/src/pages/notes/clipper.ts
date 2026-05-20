export interface ClipboardClipInput {
  html?: string
  text?: string
  capturedAt?: Date
}

export interface BuiltClipNote {
  title: string
  content: string
  sourceUrl?: string
}

const CLIP_SOURCE_RE = /https?:\/\/[^\s<>"')]+/i

export async function readClipboardClipInput(): Promise<ClipboardClipInput> {
  const clipboard = navigator.clipboard
  let html = ''
  let text = ''

  if (clipboard && 'read' in clipboard) {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        if (!html && item.types.includes('text/html')) {
          html = await (await item.getType('text/html')).text()
        }
        if (!text && item.types.includes('text/plain')) {
          text = await (await item.getType('text/plain')).text()
        }
      }
    } catch {
      // Browsers may deny rich clipboard reads; plain text fallback below still works.
    }
  }

  if (!text && clipboard?.readText) {
    text = await clipboard.readText()
  }

  return { html, text, capturedAt: new Date() }
}

export function buildClipNote(input: ClipboardClipInput): BuiltClipNote {
  const capturedAt = input.capturedAt ?? new Date()
  const html = input.html?.trim() ?? ''
  const text = input.text?.trim() ?? ''
  const parsed = html ? parseHtmlClip(html) : null
  const markdown = (parsed?.markdown || text).trim()
  const sourceUrl = firstUrl(text) ?? firstUrl(html)
  const title = clipTitle(parsed?.title, markdown, sourceUrl)

  return {
    title,
    sourceUrl,
    content: [
      '---',
      'clip_type: web',
      `clipped_at: ${capturedAt.toISOString()}`,
      sourceUrl ? `source_url: ${yamlString(sourceUrl)}` : '',
      '---',
      '',
      `# ${title}`,
      '',
      markdown || text || 'Imported clipboard clip.',
      '',
    ].filter((line, index, lines) => line !== '' || lines[index - 1] !== '').join('\n'),
  }
}

function parseHtmlClip(html: string): { title?: string; markdown: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, noscript, iframe, object, embed').forEach((node) => node.remove())
  const title = cleanText(doc.querySelector('h1')?.textContent || doc.querySelector('title')?.textContent || '')
  const root = doc.body || doc.documentElement
  return {
    title,
    markdown: normalizeMarkdown(Array.from(root.childNodes).map((node) => nodeToMarkdown(node)).join('\n')),
  }
}

function nodeToMarkdown(node: Node, listDepth = 0, listIndex = 1): string {
  if (node.nodeType === Node.TEXT_NODE) return cleanInlineText(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as HTMLElement
  const tag = element.tagName.toLowerCase()
  const children = () => Array.from(element.childNodes).map((child) => nodeToMarkdown(child, listDepth)).join('')
  const blockChildren = () => normalizeInline(children())

  if (tag === 'br') return '\n'
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${blockChildren()}\n\n`
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') return `${blockChildren()}\n\n`
  if (tag === 'strong' || tag === 'b') return `**${blockChildren()}**`
  if (tag === 'em' || tag === 'i') return `*${blockChildren()}*`
  if (tag === 'del' || tag === 's') return `~~${blockChildren()}~~`
  if (tag === 'code') return element.closest('pre') ? element.textContent || '' : `\`${(element.textContent || '').replace(/`/g, '\\`')}\``
  if (tag === 'pre') return `\n\`\`\`\n${element.textContent?.trimEnd() || ''}\n\`\`\`\n\n`
  if (tag === 'blockquote') {
    return `${normalizeMarkdown(children()).split('\n').map((line) => `> ${line}`).join('\n')}\n\n`
  }
  if (tag === 'a') {
    const label = blockChildren() || element.getAttribute('href') || ''
    const href = element.getAttribute('href') || ''
    return href ? `[${label}](${href})` : label
  }
  if (tag === 'img') {
    const src = element.getAttribute('src') || ''
    const alt = element.getAttribute('alt') || element.getAttribute('title') || ''
    return src ? `![${alt}](${src})` : ''
  }
  if (tag === 'ul' || tag === 'ol') {
    return `${Array.from(element.children).map((child, index) => nodeToMarkdown(child, listDepth + 1, index + 1)).join('')}\n`
  }
  if (tag === 'li') {
    const marker = element.parentElement?.tagName.toLowerCase() === 'ol' ? `${listIndex}.` : '-'
    const body = normalizeMarkdown(children())
      .split('\n')
      .map((line, index) => index === 0 ? line : `${'  '.repeat(listDepth)}${line}`)
      .join('\n')
    return `${'  '.repeat(Math.max(0, listDepth - 1))}${marker} ${body}\n`
  }
  if (tag === 'table') return tableToMarkdown(element)
  if (tag === 'hr') return '\n---\n\n'
  return children()
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll('th, td')).map((cell) => normalizeInline(cell.textContent || '')),
  ).filter((row) => row.length)
  if (!rows.length) return ''
  const [head, ...body] = rows
  const divider = head.map(() => '---')
  return `\n${[head, divider, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n')}\n\n`
}

function clipTitle(candidate: string | undefined, markdown: string, sourceUrl: string | undefined): string {
  const fromCandidate = cleanText(candidate || '')
  if (fromCandidate) return fromCandidate.slice(0, 80)
  const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1]
  if (firstHeading) return cleanText(firstHeading).slice(0, 80)
  const firstLine = markdown.split('\n').map(cleanText).find(Boolean)
  if (firstLine) return firstLine.slice(0, 80)
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, '')
    } catch {
      return 'Web clip'
    }
  }
  return 'Clipboard clip'
}

function firstUrl(value: string): string | undefined {
  return value.match(CLIP_SOURCE_RE)?.[0]
}

function normalizeMarkdown(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeInline(value: string): string {
  return value.replace(/[ \t\r\n]+/g, ' ').trim()
}

function cleanInlineText(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function cleanText(value: string): string {
  return normalizeInline(value).replace(/^#+\s*/, '')
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}
