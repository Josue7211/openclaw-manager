import { noteIdFromTitle } from '@/lib/vault'
import type { VaultNote } from '@/features/notes/types'
import { splitFrontmatter } from './export'

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

export interface NoteLinkPreviewModel {
  kind: 'note'
  target: string
  exists: boolean
  title: string
  anchor?: string
  folder: string
  tags: string[]
  excerpt: string
}

export interface ImageLinkPreviewModel {
  kind: 'image'
  target: string
  title: string
  alt: string
  src: string
  width?: number
}

export interface ExternalLinkPreviewModel {
  kind: 'external'
  href: string
  title: string
  domain: string
}

export interface ImageEmbedTarget {
  target: string
  alt: string
  width?: number
}

export interface ExternalLinkTarget {
  href: string
  label: string
}

export interface NoteEmbedPreviewModel {
  target: string
  title: string
  body: string
  anchor?: string
}

export function wikilinkTargetAtTextPosition(text: string, column: number): string | null {
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > 0 && text[match.index - 1] === '!') continue
    if (column >= match.index && column < match.index + match[0].length) {
      return match[1].trim() || null
    }
  }
  return null
}

export function externalLinkTargetAtTextPosition(text: string, column: number): ExternalLinkTarget | null {
  const re = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (column < match.index || column >= match.index + match[0].length) continue
    return {
      label: match[1].trim() || match[2],
      href: match[2],
    }
  }
  return null
}

export function imageEmbedTargetAtTextPosition(text: string, column: number): ImageEmbedTarget | null {
  const re = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (column < match.index || column >= match.index + match[0].length) continue
    const embed = imageEmbedPreviewParts(match[1], match[2])
    return embed
  }
  return null
}

export function noteEmbedTargetAtTextPosition(text: string, column: number): string | null {
  const re = /!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (column < match.index || column >= match.index + match[0].length) continue
    const target = match[1].trim()
    if (!target || IMAGE_EXTENSIONS.test(target)) return null
    return target
  }
  return null
}

export function noteTargetFromHref(href: string | null | undefined): string | null {
  if (!href?.startsWith('#note:')) return null
  try {
    return decodeURIComponent(href.slice('#note:'.length)).trim() || null
  } catch {
    return href.slice('#note:'.length).trim() || null
  }
}

export function notePreviewForTarget(target: string, notes: VaultNote[]): NoteLinkPreviewModel {
  const parsed = parseNotePreviewTarget(target)
  const noteTitle = parsed.noteTitle || target
  const noteId = noteIdFromTitle(noteTitle, notes)
  const note = noteId ? notes.find(item => item._id === noteId && item.type === 'note') : null
  if (!note) {
    return {
      kind: 'note',
      target,
      exists: false,
      title: noteTitle,
      anchor: parsed.anchor,
      folder: 'New note',
      tags: [],
      excerpt: 'Click to create this note.',
    }
  }

  return {
    kind: 'note',
    target,
    exists: true,
    title: note.title || noteTitle,
    anchor: parsed.anchor,
    folder: note.folder || 'Vault root',
    tags: note.tags.slice(0, 5),
    excerpt: notePreviewExcerpt(note.content, parsed.anchor),
  }
}

export function externalPreviewForHref(href: string, label?: string): ExternalLinkPreviewModel {
  return {
    kind: 'external',
    href,
    title: label?.trim() || href,
    domain: externalLinkDomain(href),
  }
}

export function imagePreviewForTarget(embed: ImageEmbedTarget): ImageLinkPreviewModel {
  return {
    kind: 'image',
    target: embed.target,
    title: embed.target.split('/').pop() || embed.target,
    alt: embed.alt,
    src: `/api/vault/local/media?id=${encodeURIComponent(embed.target)}`,
    width: embed.width,
  }
}

export function noteEmbedPreviewForTarget(
  rawTarget: string,
  allNotes: VaultNote[],
  currentId: string,
  maxLines = 32,
): NoteEmbedPreviewModel | null {
  if (IMAGE_EXTENSIONS.test(rawTarget.trim())) return null
  const target = parseNotePreviewTarget(rawTarget)
  const id = noteIdFromTitle(target.noteTitle || rawTarget, allNotes)
  const embedded = id ? allNotes.find((item) => item._id === id && item._id !== currentId && item.type === 'note') : null
  if (!embedded) return null
  const body = notePreviewMarkdown(embedded.content, target.anchor)
  if (!body) return null
  const title = target.anchor ? `${embedded.title || target.noteTitle} / ${target.anchor}` : embedded.title || rawTarget
  return {
    target: rawTarget.trim(),
    title,
    anchor: target.anchor,
    body: body
      .trim()
      .split('\n')
      .slice(0, maxLines)
      .join('\n'),
  }
}

export function expandNoteEmbeds(content: string, allNotes: VaultNote[], currentId: string): string {
  return content.replace(/!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (match, rawTarget: string) => {
    const embed = noteEmbedPreviewForTarget(rawTarget, allNotes, currentId)
    if (!embed) return match
    return `\n> [!note] ${embed.title}\n${embed.body.split('\n').map((line) => `> ${line}`).join('\n')}\n`
  })
}

function externalLinkDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '') || href
  } catch {
    return href
  }
}

export function imageEmbedPreviewParts(rawTarget: string, rawMeta = ''): ImageEmbedTarget | null {
  const target = rawTarget.trim()
  if (!IMAGE_EXTENSIONS.test(target)) return null
  const parts = rawMeta.split('|').map(part => part.trim()).filter(Boolean)
  const numeric = parts.find(part => /^\d{2,4}$/.test(part))
  const alt = parts.find(part => part !== numeric) || target.split('/').pop() || target
  return {
    target,
    alt,
    width: numeric ? Number(numeric) : undefined,
  }
}

export function notePreviewExcerpt(markdown: string, anchor?: string): string {
  const scopedBody = notePreviewMarkdown(markdown, anchor)
  if (!scopedBody) return anchor ? `Anchor "${anchor}" was not found in this note.` : 'Empty note.'
  const lines = scopedBody
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .split('\n')
    .map(line => line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^[-*]\s+\[[ xX]\]\s+/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`~=#]/g, '')
      .trim(),
    )
    .filter(Boolean)

  const excerpt = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!excerpt) return 'Empty note.'
  return excerpt.length > 220 ? `${excerpt.slice(0, 217).trimEnd()}...` : excerpt
}

export function notePreviewMarkdown(markdown: string, anchor?: string): string | null {
  const body = splitFrontmatter(markdown).body
  if (!anchor) return body
  return bodyForAnchor(body, anchor)
}

export function parseNotePreviewTarget(target: string): { noteTitle: string; anchor?: string } {
  const clean = target.trim()
  const hashIndex = clean.indexOf('#')
  if (hashIndex === -1) return { noteTitle: clean }
  const noteTitle = clean.slice(0, hashIndex).trim()
  const rawAnchor = clean.slice(hashIndex + 1).trim()
  return {
    noteTitle,
    anchor: decodeAnchor(rawAnchor) || undefined,
  }
}

function bodyForAnchor(body: string, anchor: string): string | null {
  const cleanAnchor = decodeAnchor(anchor).replace(/^\^/, '').trim()
  if (!cleanAnchor) return null
  return blockForId(body, cleanAnchor) ?? sectionForHeading(body, cleanAnchor)
}

function sectionForHeading(body: string, anchor: string): string | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const wanted = normalizeAnchor(anchor)
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!heading) continue
    const headingText = heading[2].trim()
    if (normalizeAnchor(headingText) !== wanted) continue
    const level = heading[1].length
    const section = [lines[index]]
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextHeading = lines[next].match(/^(#{1,6})\s+/)
      if (nextHeading && nextHeading[1].length <= level) break
      section.push(lines[next])
      if (section.filter(line => line.trim()).length >= 8) break
    }
    return section.join('\n')
  }
  return null
}

function blockForId(body: string, blockId: string): string | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const marker = new RegExp(`(?:^|\\s)\\^${escapeRegExp(blockId)}(?:\\s|$)`)
  for (let index = 0; index < lines.length; index += 1) {
    if (!marker.test(lines[index])) continue
    const lineWithoutMarker = lines[index].replace(marker, ' ').trim()
    if (lineWithoutMarker) return lineWithoutMarker
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (lines[previous].trim()) return lines[previous]
    }
    return lines[index]
  }
  return null
}

function decodeAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor).trim()
  } catch {
    return anchor.trim()
  }
}

function normalizeAnchor(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~=#]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
