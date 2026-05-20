import { normalizeFolderPath } from '@/lib/vault'

export interface PlannedMarkdownNoteImport {
  file: File
  originalPath: string
  path: string
  name: string
  title: string
  folder: string
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
