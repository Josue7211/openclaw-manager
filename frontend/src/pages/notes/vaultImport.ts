import { normalizeFolderPath } from '@/lib/vault'

export interface PlannedMarkdownNoteImport {
  file: File
  originalPath: string
  path: string
  name: string
  title: string
  folder: string
  sourceType: 'markdown' | 'html' | 'text'
}

export interface PlannedAttachmentImport {
  file: File
  originalPath: string
  path: string
  name: string
  folder: string
  id: string
}

export interface MarkdownVaultImportPlan {
  notes: PlannedMarkdownNoteImport[]
  attachments: PlannedAttachmentImport[]
  skipped: number
}

interface AttachmentImportLookup {
  byPath: Map<string, string>
  byBasename: Map<string, string | null>
}

const MARKDOWN_FILE_RE = /\.(md|markdown|mdown)$/i
const HTML_FILE_RE = /\.(html|htm)$/i
const TEXT_FILE_RE = /\.(txt|text)$/i
const SYSTEM_FOLDERS = new Set(['.obsidian', '.git', '.trash', '.DS_Store'])

export function planMarkdownVaultImport(files: File[]): MarkdownVaultImportPlan {
  const entries = files.map((file) => ({
    file,
    originalPath: fileImportPath(file),
    parts: safePathParts(fileImportPath(file)),
  }))
  const root = commonFolderRoot(entries.map((entry) => entry.parts))
  const plan: MarkdownVaultImportPlan = { notes: [], attachments: [], skipped: 0 }

  for (const entry of entries) {
    const parts = root ? entry.parts.slice(1) : entry.parts
    const name = parts.at(-1) || entry.file.name
    const parentParts = parts.slice(0, -1)
    const path = parts.join('/')
    const folder = normalizeFolderPath(parentParts.join('/'))

    if (!parts.length || parentParts.some((part) => SYSTEM_FOLDERS.has(part)) || SYSTEM_FOLDERS.has(name)) {
      plan.skipped += 1
      continue
    }

    if (MARKDOWN_FILE_RE.test(name) || entry.file.type.includes('markdown')) {
      plan.notes.push({
        file: entry.file,
        originalPath: entry.originalPath,
        path,
        name,
        title: name.replace(/\.(md|markdown|mdown)$/i, '') || 'Imported note',
        folder,
        sourceType: 'markdown',
      })
      continue
    }

    if (HTML_FILE_RE.test(name) || entry.file.type.includes('html')) {
      plan.notes.push({
        file: entry.file,
        originalPath: entry.originalPath,
        path,
        name,
        title: name.replace(/\.(html|htm)$/i, '') || 'Imported note',
        folder,
        sourceType: 'html',
      })
      continue
    }

    if (TEXT_FILE_RE.test(name) || entry.file.type === 'text/plain') {
      plan.notes.push({
        file: entry.file,
        originalPath: entry.originalPath,
        path,
        name,
        title: name.replace(/\.(txt|text)$/i, '') || 'Imported note',
        folder,
        sourceType: 'text',
      })
      continue
    }

    if (entry.file.size > 0) {
      const attachmentFolder = folder || 'attachments'
      plan.attachments.push({
        file: entry.file,
        originalPath: entry.originalPath,
        path,
        name,
        folder: attachmentFolder,
        id: `${attachmentFolder}/${name}`,
      })
      continue
    }

    plan.skipped += 1
  }

  return plan
}

export async function readImportedNoteMarkdown(
  note: PlannedMarkdownNoteImport,
  attachments: PlannedAttachmentImport[] = [],
): Promise<string> {
  const raw = await note.file.text()
  const markdown = note.sourceType === 'html'
    ? htmlToMarkdown(raw)
    : note.sourceType === 'text'
      ? textToMarkdown(raw, note.title)
      : raw
  return rewriteImportedAttachmentEmbeds(markdown, note, attachments)
}

export function folderAncestors(folder: string): string[] {
  const parts = normalizeFolderPath(folder).split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function rewriteImportedAttachmentEmbeds(
  markdown: string,
  note: PlannedMarkdownNoteImport,
  attachments: PlannedAttachmentImport[],
): string {
  if (!attachments.length) return markdown
  const lookup = buildAttachmentImportLookup(attachments)

  return markdown
    .replace(/!\[\[([^\]]+)\]\]/g, (match, rawTarget: string) => {
      const [target, ...suffix] = rawTarget.split('|')
      const resolved = resolveImportedAttachmentTarget(target, note, lookup)
      if (!resolved) return match
      return `![[${resolved}${suffix.length ? `|${suffix.join('|')}` : ''}]]`
    })
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt: string, rawTarget: string) => {
      const resolved = resolveImportedAttachmentTarget(rawTarget, note, lookup)
      if (!resolved) return match
      const cleanAlt = alt.trim()
      return `![[${resolved}${cleanAlt ? `|${cleanAlt}` : ''}]]`
    })
}

function buildAttachmentImportLookup(attachments: PlannedAttachmentImport[]): AttachmentImportLookup {
  const byPath = new Map<string, string>()
  const byBasename = new Map<string, string | null>()

  for (const attachment of attachments) {
    byPath.set(attachmentLookupKey(attachment.id), attachment.id)
    byPath.set(attachmentLookupKey(attachment.path), attachment.id)

    const basename = attachment.name.toLowerCase()
    const existing = byBasename.get(basename)
    byBasename.set(basename, existing === undefined ? attachment.id : null)
  }

  return { byPath, byBasename }
}

function resolveImportedAttachmentTarget(
  rawTarget: string,
  note: PlannedMarkdownNoteImport,
  lookup: AttachmentImportLookup,
): string | null {
  const target = normalizeImportTarget(rawTarget)
  if (!target || isExternalTarget(target)) return null

  const exact = lookup.byPath.get(attachmentLookupKey(target))
  if (exact) return exact

  const relative = normalizeRelativeTarget(note.folder, target)
  const relativeMatch = lookup.byPath.get(attachmentLookupKey(relative))
  if (relativeMatch) return relativeMatch

  const basename = target.split('/').pop()?.toLowerCase()
  if (!basename) return null
  return lookup.byBasename.get(basename) ?? null
}

function fileImportPath(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relativePath?.trim() || file.name
}

function safePathParts(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
}

function commonFolderRoot(paths: string[][]): string {
  if (!paths.length || paths.some((parts) => parts.length < 2)) return ''
  const root = paths[0][0]
  return paths.every((parts) => parts[0] === root) ? root : ''
}

function normalizeImportTarget(target: string): string {
  try {
    target = decodeURIComponent(target)
  } catch {
    // Keep original target when it is not URL-encoded.
  }
  return target.trim().replace(/\\/g, '/').replace(/^\/+/, '')
}

function normalizeRelativeTarget(folder: string, target: string): string {
  const parts = [...normalizeFolderPath(folder).split('/').filter(Boolean)]
  for (const part of target.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function attachmentLookupKey(path: string): string {
  return normalizeImportTarget(path).toLowerCase()
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')
}

function textToMarkdown(text: string, title: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  if (/^#{1,6}\s+/m.test(normalized)) return normalized
  return [`# ${title}`, '', normalized].join('\n')
}

function htmlToMarkdown(html: string): string {
  const doc = parseHtmlDocument(html)
  if (!doc) return textToMarkdown(stripHtml(html), 'Imported HTML')
  const body = doc.body
  const chunks = Array.from(body.childNodes)
    .map(node => htmlNodeToMarkdown(node, { listDepth: 0 }))
    .map(chunk => chunk.trim())
    .filter(Boolean)
  return normalizeMarkdownBlocks(chunks.join('\n\n'))
}

function parseHtmlDocument(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  try {
    return new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return null
  }
}

function htmlNodeToMarkdown(node: Node, context: { listDepth: number }): string {
  if (node.nodeType === Node.TEXT_NODE) return collapseInlineWhitespace(node.textContent ?? '')
  if (!(node instanceof HTMLElement)) return ''

  const tag = node.tagName.toLowerCase()
  if (tag === 'script' || tag === 'style' || tag === 'template') return ''
  if (tag === 'br') return '\n'
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    return `${'#'.repeat(level)} ${inlineChildrenToMarkdown(node, context).trim()}`
  }
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') {
    return blockChildrenToMarkdown(node, context)
  }
  if (tag === 'blockquote') {
    return blockChildrenToMarkdown(node, context)
      .split('\n')
      .map(line => line.trim() ? `> ${line}` : '>')
      .join('\n')
  }
  if (tag === 'pre') return `\`\`\`\n${node.textContent?.replace(/\n+$/g, '') ?? ''}\n\`\`\``
  if (tag === 'ul' || tag === 'ol') return listToMarkdown(node, tag === 'ol', context)
  if (tag === 'li') return inlineChildrenToMarkdown(node, context).trim()
  if (tag === 'strong' || tag === 'b') return wrapInline('**', inlineChildrenToMarkdown(node, context))
  if (tag === 'em' || tag === 'i') return wrapInline('*', inlineChildrenToMarkdown(node, context))
  if (tag === 'code') return `\`${(node.textContent ?? '').replace(/`/g, '\\`')}\``
  if (tag === 'a') {
    const label = inlineChildrenToMarkdown(node, context).trim() || node.getAttribute('href') || ''
    const href = node.getAttribute('href')?.trim()
    if (!href) return label
    if (href.startsWith('#')) return label
    return `[${label}](${href})`
  }
  if (tag === 'img') {
    const src = node.getAttribute('src')?.trim()
    if (!src) return ''
    const alt = node.getAttribute('alt')?.trim() ?? ''
    return `![${alt}](${src})`
  }
  if (tag === 'hr') return '---'
  return inlineChildrenToMarkdown(node, context)
}

function blockChildrenToMarkdown(element: HTMLElement, context: { listDepth: number }): string {
  return normalizeMarkdownBlocks(
    Array.from(element.childNodes)
      .map(child => htmlNodeToMarkdown(child, context))
      .join(''),
  )
}

function inlineChildrenToMarkdown(element: HTMLElement, context: { listDepth: number }): string {
  return Array.from(element.childNodes)
    .map(child => htmlNodeToMarkdown(child, context))
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
}

function listToMarkdown(element: HTMLElement, ordered: boolean, context: { listDepth: number }): string {
  const indent = '  '.repeat(context.listDepth)
  return Array.from(element.children)
    .filter(child => child.tagName.toLowerCase() === 'li')
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-'
      const nested = Array.from(item.children)
        .filter(child => child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol')
      const inlineParts = Array.from(item.childNodes)
        .filter(child => !nested.includes(child as Element))
        .map(child => htmlNodeToMarkdown(child, context))
        .join('')
        .trim()
      const nestedMarkdown = nested
        .map(child => listToMarkdown(child as HTMLElement, child.tagName.toLowerCase() === 'ol', { listDepth: context.listDepth + 1 }))
        .filter(Boolean)
        .join('\n')
      return [`${indent}${marker} ${inlineParts}`, nestedMarkdown].filter(Boolean).join('\n')
    })
    .join('\n')
}

function wrapInline(marker: string, value: string): string {
  const trimmed = value.trim()
  return trimmed ? `${marker}${trimmed}${marker}` : ''
}

function collapseInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ')
}

function normalizeMarkdownBlocks(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
