import type { VaultFolder, VaultNote } from '@/pages/notes/types'
import { api } from '@/lib/api'

/**
 * Vault — note storage backed by CouchDB via the Axum backend proxy.
 *
 * All CouchDB requests go through /api/vault/* — credentials never
 * reach the frontend. Metadata is cached in localStorage for offline
 * list rendering; full content is fetched from the backend on load.
 */

const META_STORAGE_KEY = 'mc-notes-meta'
const FOLDER_STORAGE_KEY = 'mc-notes-folders'
const FOLDER_DOC_PREFIX = 'cc:folder:'

interface NoteMeta {
  _id: string
  title: string
  folder: string
  tags: string[]
  links: string[]
  aliases?: string[]
  properties?: Record<string, string | string[]>
  created_at: number
  updated_at: number
}

interface FolderMeta {
  _id: string
  _rev?: string
  type: 'folder'
  path: string
  name: string
  created_at: number
  updated_at: number
}

export interface VaultAttachmentUpload {
  id: string
  rev?: string
  mime: string
  size: number
  created_at: number
}

function toMeta(note: VaultNote): NoteMeta {
  return {
    _id: note._id,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    links: note.links,
    aliases: note.aliases,
    properties: note.properties,
    created_at: note.created_at,
    updated_at: note.updated_at,
  }
}

function toFolderMeta(folder: VaultFolder): FolderMeta {
  return {
    _id: folder._id,
    _rev: folder._rev,
    type: 'folder',
    path: folder.path,
    name: folder.name,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  }
}

/** Internal LiveSync prefixes that should never appear as user notes. */
const INTERNAL_PREFIXES = ['h:', '_design/', 'ps:', 'ix:', 'cc:', '.obsidian/', '.obsidian-livesync/', 'obsydian_livesync', '!:']

function isInternalDoc(id: string): boolean {
  return INTERNAL_PREFIXES.some((p) => id.startsWith(p))
}

function loadMetaCache(): Map<string, NoteMeta> {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY)
    if (!raw) return new Map()
    const arr: NoteMeta[] = JSON.parse(raw)
    // Filter out stale LiveSync internal docs that may have been cached previously
    const filtered = arr.filter((m) => !isInternalDoc(m._id))
    return new Map(filtered.map((m) => [m._id, m]))
  } catch {
    return new Map()
  }
}

function saveMetaCache(meta: Map<string, NoteMeta>) {
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify([...meta.values()]))
}

function loadFolderCache(): Map<string, VaultFolder> {
  try {
    const raw = localStorage.getItem(FOLDER_STORAGE_KEY)
    if (!raw) return new Map()
    const arr: FolderMeta[] = JSON.parse(raw)
    return new Map(arr.map((f) => [f.path, f]))
  } catch {
    return new Map()
  }
}

function saveFolderCache(folders: Map<string, VaultFolder>) {
  localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify([...folders.values()].map(toFolderMeta)))
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// In-memory note cache (includes content)
const notesCache: Map<string, VaultNote> = new Map()
const foldersCache: Map<string, VaultFolder> = loadFolderCache()
const metaCache: Map<string, NoteMeta> = loadMetaCache()
let syncInterval: ReturnType<typeof setInterval> | null = null
let hasFetchedFromBackend = false
let hasFetchedFoldersFromBackend = false

// Hydrate notes from meta cache on startup (content will be empty until fetched)
for (const [id, meta] of metaCache) {
  notesCache.set(id, {
    ...meta,
    _id: meta._id,
    type: 'note',
    content: '',
    aliases: meta.aliases,
    properties: meta.properties,
  })
}

// Convert a CouchDB doc to a VaultNote
function docToNote(doc: Record<string, unknown>): VaultNote {
  const id = (doc._id as string) || ''
  const title = (doc.title as string) || id.replace(/\.md$/, '').split('/').pop() || id
  const content = (doc.content as string) || (doc.body as string) || ''
  const frontmatter = parseFrontmatter(content)
  const folder = (doc.folder as string) || (doc.path as string)?.split('/').slice(0, -1).join('/') || ''
  const tags = Array.isArray(doc.tags)
    ? doc.tags
    : [...new Set([...extractTags(content), ...frontmatterTags(frontmatter.properties)])]
  const links = Array.isArray(doc.links) ? doc.links : extractWikilinks(content)
  const aliases = Array.isArray(doc.aliases)
    ? doc.aliases.filter((alias): alias is string => typeof alias === 'string')
    : frontmatterAliases(frontmatter.properties)
  const created = (doc.created_at as number) || (doc.ctime as number) || Date.now()
  const updated = (doc.updated_at as number) || (doc.mtime as number) || Date.now()

  return {
    _id: id,
    _rev: doc._rev as string | undefined,
    type: 'note',
    title,
    content,
    folder,
    tags,
    links,
    aliases,
    properties: frontmatter.properties,
    created_at: created,
    updated_at: updated,
  }
}

function docToFolder(doc: Record<string, unknown>): VaultFolder | null {
  const id = (doc._id as string) || ''
  const rawPath = (doc.path as string) || pathFromFolderDocId(id)
  const path = normalizeFolderPath(rawPath)
  if (!path) return null
  const now = Date.now()
  return {
    _id: id || folderDocId(path),
    _rev: doc._rev as string | undefined,
    type: 'folder',
    path,
    name: path.split('/').pop() || path,
    created_at: (doc.created_at as number) || now,
    updated_at: (doc.updated_at as number) || now,
  }
}

// --- Sync via backend proxy ---

async function fetchAllFromBackend(): Promise<VaultNote[]> {
  const json = await api.get<any>('/api/vault/notes')
  const payload = json?.data || json || {}

  // New format: { notes: [...], attachments: [...] }
  const rawNotes = Array.isArray(payload.notes) ? payload.notes : (Array.isArray(payload) ? payload : [])
  const rawAttachments: Array<{ _id: string }> = Array.isArray(payload.attachments) ? payload.attachments : []

  const notes = rawNotes.map(docToNote).filter((n: VaultNote) => !isInternalDoc(n._id))

  // Convert attachment stubs into VaultNote objects (no content, type=attachment)
  for (const att of rawAttachments) {
    if (isInternalDoc(att._id)) continue
    const id = att._id
    const name = id.split('/').pop() || id
    const folder = id.includes('/') ? id.split('/').slice(0, -1).join('/') : ''
    notes.push({
      _id: id,
      type: 'attachment' as const,
      title: name,
      content: '',
      folder,
      tags: [],
      links: [],
      created_at: 0,
      updated_at: 0,
    })
  }

  return notes
}

async function fetchFoldersFromBackend(): Promise<VaultFolder[]> {
  try {
    const json = await api.get<any>('/api/vault/folders')
    const payload = json?.data || json || {}
    const rawFolders = Array.isArray(payload.folders) ? payload.folders : []
    return rawFolders
      .map(docToFolder)
      .filter((folder: VaultFolder | null): folder is VaultFolder => !!folder)
  } catch (err) {
    console.warn('[vault] folder list failed, using local cache:', err)
    return [...foldersCache.values()]
  }
}

export function startSync(onChange?: () => void) {
  if (syncInterval) return
  syncInterval = setInterval(async () => {
    const [notes, folders] = await Promise.all([
      fetchAllFromBackend(),
      fetchFoldersFromBackend(),
    ])
    if (notes.length > 0 || folders.length > 0) {
      notesCache.clear()
      metaCache.clear()
      for (const note of notes) {
        notesCache.set(note._id, note)
        metaCache.set(note._id, toMeta(note))
      }
      foldersCache.clear()
      for (const folder of folders) {
        foldersCache.set(folder.path, folder)
      }
      saveMetaCache(metaCache)
      saveFolderCache(foldersCache)
      onChange?.()
    }
  }, 30000)
}

export function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
}

// --- CRUD ---

export async function getAllNotes(): Promise<VaultNote[]> {
  if (!hasFetchedFromBackend) {
    const notes = await fetchAllFromBackend()
    if (notes.length > 0) {
      notesCache.clear()
      for (const note of notes) {
        notesCache.set(note._id, note)
        metaCache.set(note._id, toMeta(note))
      }
      saveMetaCache(metaCache)
    }
    hasFetchedFromBackend = true
  }
  return [...notesCache.values()]
    .filter((n) => n.type === 'note' || n.type === 'attachment')
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function getAllFolders(): Promise<VaultFolder[]> {
  if (!hasFetchedFoldersFromBackend) {
    const folders = await fetchFoldersFromBackend()
    if (folders.length > 0) {
      foldersCache.clear()
      for (const folder of folders) {
        foldersCache.set(folder.path, folder)
      }
      saveFolderCache(foldersCache)
    }
    hasFetchedFoldersFromBackend = true
  }
  return [...foldersCache.values()].sort((a, b) => a.path.localeCompare(b.path))
}

export async function putNote(note: VaultNote): Promise<VaultNote> {
  const now = Date.now()
  const frontmatter = parseFrontmatter(note.content)
  const links = extractWikilinks(note.content)
  const tags = [...new Set([...extractTags(note.content), ...frontmatterTags(frontmatter.properties)])]
  const aliases = frontmatterAliases(frontmatter.properties)

  const doc: VaultNote = {
    ...note,
    type: 'note',
    links,
    tags,
    aliases,
    properties: frontmatter.properties,
    updated_at: now,
    created_at: note.created_at || now,
  }

  try {
    const body: Record<string, unknown> = { ...doc }
    const result = await api.put<any>(`/api/vault/doc?id=${encodeURIComponent(doc._id)}`, body)
    const data = result?.data || result
    if (data?.rev) doc._rev = data.rev
  } catch (err) {
    console.warn('[vault] put failed, saved locally:', err)
  }

  notesCache.set(doc._id, doc)
  metaCache.set(doc._id, toMeta(doc))
  saveMetaCache(metaCache)

  return doc
}

export async function uploadAttachment(file: File, folder = 'attachments'): Promise<VaultAttachmentUpload> {
  const dataUrl = await fileToDataUrl(file)
  const result = await api.post<any>('/api/vault/attachment', {
    name: file.name,
    mime: file.type || 'application/octet-stream',
    folder: normalizeFolderPath(folder) || 'attachments',
    data: dataUrl,
  })
  const payload = result?.data || result
  const uploaded: VaultAttachmentUpload = {
    id: payload.id,
    rev: payload.rev,
    mime: payload.mime || file.type || 'application/octet-stream',
    size: payload.size || file.size,
    created_at: payload.created_at || Date.now(),
  }
  const name = uploaded.id.split('/').pop() || uploaded.id
  notesCache.set(uploaded.id, {
    _id: uploaded.id,
    _rev: uploaded.rev,
    type: 'attachment',
    title: name,
    content: '',
    folder: uploaded.id.includes('/') ? uploaded.id.split('/').slice(0, -1).join('/') : '',
    tags: [],
    links: [],
    created_at: uploaded.created_at,
    updated_at: uploaded.created_at,
  })
  return uploaded
}

export async function deleteNote(id: string): Promise<void> {
  const note = notesCache.get(id)
  if (note?._rev) {
    try {
      await api.del(`/api/vault/doc?id=${encodeURIComponent(id)}&rev=${note._rev}`)
    } catch (err) {
      console.warn('[vault] delete failed:', err)
    }
  }
  notesCache.delete(id)
  metaCache.delete(id)
  saveMetaCache(metaCache)
}

export async function createNote(
  title: string,
  folder: string = '',
  content: string = '',
): Promise<VaultNote> {
  const normalizedFolder = normalizeFolderPath(folder)
  const slug = slugify(title) || 'untitled'
  const path = uniqueNotePath(normalizedFolder, slug)
  const now = Date.now()

  const note: VaultNote = {
    _id: path,
    type: 'note',
    title,
    content,
    folder: normalizedFolder,
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: now,
    updated_at: now,
  }

  return putNote(note)
}

export async function moveNote(id: string, folder: string = ''): Promise<VaultNote> {
  const note = notesCache.get(id)
  if (!note) throw new Error('Note not found')
  if (note.type === 'attachment') throw new Error('Attachments cannot be moved')

  const normalizedFolder = normalizeFolderPath(folder)
  if (normalizedFolder === note.folder) return note

  const fileName = note._id.split('/').pop() || `${slugify(note.title) || 'untitled'}.md`
  const stem = fileName.replace(/\.md$/i, '') || slugify(note.title) || 'untitled'
  const nextId = uniqueNotePath(normalizedFolder, stem, id)
  const moved: VaultNote = {
    ...note,
    _id: nextId,
    _rev: undefined,
    folder: normalizedFolder,
    updated_at: Date.now(),
  }

  const saved = await putNote(moved)
  await deleteNote(id)
  return saved
}

export async function createFolder(path: string): Promise<VaultFolder> {
  const normalized = normalizeFolderPath(path)
  if (!normalized) {
    throw new Error('Folder name required')
  }

  const now = Date.now()
  const existing = foldersCache.get(normalized)
  const folder: VaultFolder = {
    _id: existing?._id || folderDocId(normalized),
    _rev: existing?._rev,
    type: 'folder',
    path: normalized,
    name: normalized.split('/').pop() || normalized,
    created_at: existing?.created_at || now,
    updated_at: now,
  }

  try {
    const result = await api.put<any>(
      `/api/vault/folder?path=${encodeURIComponent(normalized)}`,
      folder,
    )
    const data = result?.data || result
    const saved = docToFolder(data?.folder || data)
    if (saved) {
      foldersCache.set(saved.path, saved)
      saveFolderCache(foldersCache)
      return saved
    }
  } catch (err) {
    console.warn('[vault] create folder failed, saved locally:', err)
  }

  foldersCache.set(folder.path, folder)
  saveFolderCache(foldersCache)
  return folder
}

export async function deleteFolder(path: string): Promise<void> {
  const normalized = normalizeFolderPath(path)
  if (!normalized) return

  const folder = foldersCache.get(normalized)
  try {
    const rev = folder?._rev ? `&rev=${encodeURIComponent(folder._rev)}` : ''
    await api.del(`/api/vault/folder?path=${encodeURIComponent(normalized)}${rev}`)
  } catch (err) {
    console.warn('[vault] delete folder failed:', err)
  }

  foldersCache.delete(normalized)
  saveFolderCache(foldersCache)
}

// --- Helpers ---

export function normalizeFolderPath(path: string): string {
  return path
    .split('/')
    .map((part) => part.trim().replace(/[\\:*?"<>|]/g, ''))
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
}

function folderDocId(path: string): string {
  return `${FOLDER_DOC_PREFIX}${path}`
}

function pathFromFolderDocId(id: string): string {
  if (!id.startsWith(FOLDER_DOC_PREFIX)) return ''
  return id.slice(FOLDER_DOC_PREFIX.length)
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function uniqueNotePath(folder: string, slug: string, ignoreId?: string): string {
  const cleanSlug = slugify(slug) || crypto.randomUUID().slice(0, 8)
  let candidate = folder ? `${folder}/${cleanSlug}.md` : `${cleanSlug}.md`
  let suffix = 2

  while (notesCache.has(candidate) && candidate !== ignoreId) {
    candidate = folder ? `${folder}/${cleanSlug}-${suffix}.md` : `${cleanSlug}-${suffix}.md`
    suffix += 1
  }

  return candidate
}

function extractWikilinks(content: string): string[] {
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links: string[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    const link = normalizeWikilinkTarget(m[1])
    if (link) links.push(link)
  }
  return [...new Set(links)]
}

function extractTags(content: string): string[] {
  const re = /(?:^|\s)#([a-zA-Z][\w/-]*)/g
  const tags: string[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    tags.push(m[1])
  }
  return [...new Set(tags)]
}

export function noteIdFromTitle(title: string, allNotes: VaultNote[]): string | null {
  const lower = normalizeComparableTitle(title)
  const found = allNotes.find(
    (n) =>
      normalizeComparableTitle(n.title) === lower ||
      normalizeComparableTitle(n._id.replace(/\.md$/, '').split('/').pop() || '') === lower ||
      n.aliases?.some((alias) => normalizeComparableTitle(alias) === lower),
  )
  return found?._id ?? null
}

export function rewriteWikilinks(content: string, fromTitle: string, toTitle: string): string {
  const from = normalizeComparableTitle(fromTitle)
  const cleanTo = toTitle.trim()
  if (!from || !cleanTo || normalizeComparableTitle(cleanTo) === from) return content

  return content.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (match, rawTarget: string, aliasPart = '') => {
    const parsed = parseWikilinkTarget(rawTarget)
    if (normalizeComparableTitle(parsed.basename) !== from) return match
    const nextTarget = parsed.prefix ? `${parsed.prefix}/${cleanTo}${parsed.suffix}` : `${cleanTo}${parsed.suffix}`
    return `[[${nextTarget}${aliasPart}]]`
  })
}

export function linkFirstPlainMention(content: string, title: string): string {
  const cleanTitle = title.trim()
  if (!cleanTitle) return content
  const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^\\w\\[])(` + escaped + `)(?![^\\[]*\\]\\])`, 'i')
  return content.replace(re, (_match, prefix: string, mention: string) => `${prefix}[[${mention}]]`)
}

interface ParsedFrontmatter {
  properties: Record<string, string | string[]>
}

export function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---\n')) return { properties: {} }
  const end = content.indexOf('\n---', 4)
  if (end === -1) return { properties: {} }
  const block = content.slice(4, end)
  const properties: Record<string, string | string[]> = {}
  const lines = block.split(/\r?\n/)
  let currentKey: string | null = null

  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/)
    if (currentKey && listMatch) {
      const existing = properties[currentKey]
      const nextValue = cleanYamlValue(listMatch[1])
      properties[currentKey] = Array.isArray(existing)
        ? [...existing, nextValue]
        : existing
          ? [existing, nextValue]
          : [nextValue]
      continue
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!pair) {
      currentKey = null
      continue
    }

    const key = pair[1]
    const raw = pair[2].trim()
    currentKey = key
    if (!raw) {
      properties[key] = []
      continue
    }
    properties[key] = parseYamlScalarOrList(raw)
  }

  return { properties }
}

function parseYamlScalarOrList(raw: string): string | string[] {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map(cleanYamlValue)
      .filter(Boolean)
  }
  return cleanYamlValue(raw)
}

function cleanYamlValue(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

function frontmatterAliases(properties: Record<string, string | string[]>): string[] {
  const raw = properties.aliases ?? properties.alias
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]).map((alias) => alias.trim()).filter(Boolean)
}

function frontmatterTags(properties: Record<string, string | string[]>): string[] {
  const raw = properties.tags ?? properties.tag
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => value.split(/[,\s]+/))
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean)
}

function normalizeWikilinkTarget(target: string): string {
  return parseWikilinkTarget(target).basename
}

function parseWikilinkTarget(target: string): { prefix: string; basename: string; suffix: string } {
  const clean = target.trim()
  const suffixMatch = clean.match(/([#^].*)$/)
  const suffix = suffixMatch?.[1] ?? ''
  const withoutSuffix = suffix ? clean.slice(0, -suffix.length) : clean
  const withoutExt = withoutSuffix.replace(/\.md$/i, '')
  const parts = withoutExt.split('/').filter(Boolean)
  const basename = parts.pop() || withoutExt
  return {
    prefix: parts.join('/'),
    basename,
    suffix,
  }
}

function normalizeComparableTitle(title: string): string {
  return normalizeWikilinkTarget(title)
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
}
