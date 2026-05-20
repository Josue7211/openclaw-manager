export interface VaultArchiveVerification {
  ok: boolean
  manifest?: {
    format?: string
    version?: number
    notes?: number
    attachments?: number
    plugin_metadata?: {
      schema?: string
      version?: number
      documents?: unknown[]
      attachments?: unknown[]
      tags?: Record<string, number>
      property_keys?: string[]
      links?: unknown[]
      backlinks?: Record<string, string[]>
      review?: {
        comments?: number
        suggestions?: number
      }
    }
  }
  entries: string[]
  errors: string[]
}

interface TarEntry {
  path: string
  data: Uint8Array
}

const TAR_BLOCK_SIZE = 512
const MANIFEST_PATH = 'vault-manifest.json'

export function verifyMarkdownVaultArchive(buffer: ArrayBuffer | Uint8Array): VaultArchiveVerification {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const errors: string[] = []
  let entries: TarEntry[] = []

  try {
    entries = parseTarEntries(bytes)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Archive could not be parsed')
  }

  const manifestEntry = entries.find(entry => entry.path === MANIFEST_PATH)
  let manifest: VaultArchiveVerification['manifest']
  if (!manifestEntry) {
    errors.push('Archive is missing vault-manifest.json')
  } else {
    try {
      manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data))
      if (manifest?.format !== 'clawcontrol-markdown-vault-tar') {
        errors.push('Archive manifest format is not supported')
      }
      if (manifest?.version !== 1) {
        errors.push('Archive manifest version is not supported')
      }
    } catch {
      errors.push('Archive manifest is not valid JSON')
    }
  }

  for (const entry of entries) {
    if (!isSafeTarPath(entry.path)) errors.push(`Unsafe archive path: ${entry.path}`)
  }

  const noteCount = entries.filter(
    entry => entry.path !== MANIFEST_PATH && entry.path.toLowerCase().endsWith('.md'),
  ).length
  const attachmentCount = entries.filter(
    entry => entry.path !== MANIFEST_PATH && !entry.path.toLowerCase().endsWith('.md'),
  ).length
  if (typeof manifest?.notes === 'number' && manifest.notes !== noteCount) {
    errors.push(`Manifest notes count ${manifest.notes} does not match archive count ${noteCount}`)
  }
  if (typeof manifest?.attachments === 'number' && manifest.attachments !== attachmentCount) {
    errors.push(`Manifest attachments count ${manifest.attachments} does not match archive count ${attachmentCount}`)
  }
  const entryPaths = new Set(entries.map(entry => entry.path))
  for (const attachmentId of manifestAttachmentIds(manifest)) {
    if (!entryPaths.has(attachmentId)) errors.push(`Manifest attachment missing from archive: ${attachmentId}`)
  }

  return {
    ok: errors.length === 0,
    manifest,
    entries: entries.map(entry => entry.path),
    errors,
  }
}

function parseTarEntries(bytes: Uint8Array): TarEntry[] {
  if (bytes.length < TAR_BLOCK_SIZE || bytes.length % TAR_BLOCK_SIZE !== 0) {
    throw new Error('Archive is not aligned to tar block size')
  }

  const entries: TarEntry[] = []
  let offset = 0
  while (offset + TAR_BLOCK_SIZE <= bytes.length) {
    const header = bytes.slice(offset, offset + TAR_BLOCK_SIZE)
    if (header.every(byte => byte === 0)) break

    const name = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const path = [prefix, name].filter(Boolean).join('/')
    if (!path) throw new Error('Archive contains an entry without a path')

    const sizeRaw = readTarString(header, 124, 12).trim()
    const size = Number.parseInt(sizeRaw || '0', 8)
    if (!Number.isFinite(size) || size < 0) throw new Error(`Archive entry has invalid size: ${path}`)

    const dataStart = offset + TAR_BLOCK_SIZE
    const dataEnd = dataStart + size
    if (dataEnd > bytes.length) throw new Error(`Archive entry exceeds archive size: ${path}`)
    entries.push({ path, data: bytes.slice(dataStart, dataEnd) })
    offset = dataStart + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
  }

  return entries
}

function readTarString(bytes: Uint8Array, start: number, length: number): string {
  const end = start + length
  const sliceEnd = bytes.indexOf(0, start)
  return new TextDecoder().decode(bytes.slice(start, sliceEnd >= start && sliceEnd < end ? sliceEnd : end)).trim()
}

function isSafeTarPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(part => part && part !== '.' && part !== '..')
}

function manifestAttachmentIds(manifest: VaultArchiveVerification['manifest']): string[] {
  const attachments = manifest?.plugin_metadata?.attachments
  if (!Array.isArray(attachments)) return []
  return attachments
    .map(attachment => {
      if (!attachment || typeof attachment !== 'object') return undefined
      const { id } = attachment as { id?: unknown }
      return typeof id === 'string' && id.trim() ? id : undefined
    })
    .filter((id): id is string => Boolean(id))
}
