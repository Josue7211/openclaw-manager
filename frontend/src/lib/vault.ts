import type { VaultNote } from '@/pages/notes/types'
import { api } from '@/lib/api'

/**
 * Vault — note storage backed by CouchDB via the Axum backend proxy.
 *
 * All CouchDB requests go through /api/vault/* — credentials never
 * reach the frontend. Metadata is cached in localStorage for offline
 * list rendering; full content is fetched from the backend on load.
 */

const META_STORAGE_KEY = 'mc-notes-meta'

interface NoteMeta {
  _id: string
  title: string
  folder: string
  tags: string[]
  links: string[]
  created_at: number
  updated_at: number
}

function toMeta(note: VaultNote): NoteMeta {
  return {
    _id: note._id,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    links: note.links,
    created_at: note.created_at,
    updated_at: note.updated_at,
  }
}

/** Internal LiveSync prefixes that should never appear as user notes. */
const INTERNAL_PREFIXES = ['h:', '_design/', 'ps:', 'ix:', 'cc:', '.obsidian/', '.obsidian-livesync/', 'obsydian_livesync', '!:']

/** Image extensions for detecting attachment types. */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']

function isInternalDoc(id: string): boolean {
  return INTERNAL_PREFIXES.some((p) => id.startsWith(p))
}

export function isImageFile(id: string): boolean {
  const lower = id.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
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

// In-memory note cache (includes content)
let notesCache: Map<string, VaultNote> = new Map()
let metaCache: Map<string, NoteMeta> = loadMetaCache()
let syncInterval: ReturnType<typeof setInterval> | null = null
let hasFetchedFromBackend = false

// Hydrate notes from meta cache on startup (content will be empty until fetched)
for (const [id, meta] of metaCache) {
  notesCache.set(id, {
    ...meta,
    _id: meta._id,
    type: 'note',
    content: '',
  })
}

// Convert a CouchDB doc to a VaultNote
function docToNote(doc: Record<string, unknown>): VaultNote {
  const id = (doc._id as string) || ''
  const title = (doc.title as string) || id.replace(/\.md$/, '').split('/').pop() || id
  const content = (doc.content as string) || (doc.body as string) || ''
  const folder = (doc.folder as string) || (doc.path as string)?.split('/').slice(0, -1).join('/') || ''
  const tags = Array.isArray(doc.tags) ? doc.tags : extractTags(content)
  const links = Array.isArray(doc.links) ? doc.links : extractWikilinks(content)
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
    created_at: created,
    updated_at: updated,
  }
}

// --- Sync via backend proxy ---

async function fetchAllFromBackend(): Promise<VaultNote[]> {
  try {
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
  } catch (err) {
    console.warn('[vault] fetch failed:', err)
    return []
  }
}

export function startSync(onChange?: () => void) {
  if (syncInterval) return
  syncInterval = setInterval(async () => {
    const notes = await fetchAllFromBackend()
    if (notes.length > 0) {
      notesCache.clear()
      metaCache.clear()
      for (const note of notes) {
        notesCache.set(note._id, note)
        metaCache.set(note._id, toMeta(note))
      }
      saveMetaCache(metaCache)
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

export async function getNote(id: string): Promise<VaultNote | null> {
  try {
    const json = await api.get<any>(`/api/vault/notes/${encodeURIComponent(id)}`)
    const doc = json?.data || json
    const note = docToNote(doc)
    notesCache.set(note._id, note)
    metaCache.set(note._id, toMeta(note))
    saveMetaCache(metaCache)
    return note
  } catch {
    return notesCache.get(id) ?? null
  }
}

export async function putNote(note: VaultNote): Promise<VaultNote> {
  const now = Date.now()
  const links = extractWikilinks(note.content)
  const tags = extractTags(note.content)

  const doc: VaultNote = {
    ...note,
    type: 'note',
    links,
    tags,
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
): Promise<VaultNote> {
  const slug = slugify(title) || crypto.randomUUID().slice(0, 8)
  const path = folder ? `${folder}/${slug}.md` : `${slug}.md`
  const now = Date.now()

  const note: VaultNote = {
    _id: path,
    type: 'note',
    title,
    content: '',
    folder,
    tags: [],
    links: [],
    created_at: now,
    updated_at: now,
  }

  return putNote(note)
}

export async function renameNote(
  oldId: string,
  newTitle: string,
): Promise<VaultNote | null> {
  const old = notesCache.get(oldId)
  if (!old) return null

  const slug = slugify(newTitle) || crypto.randomUUID().slice(0, 8)
  const newId = old.folder ? `${old.folder}/${slug}.md` : `${slug}.md`

  if (newId === oldId) {
    return putNote({ ...old, title: newTitle })
  }

  await deleteNote(oldId)
  const newNote: VaultNote = {
    ...old,
    _id: newId,
    _rev: undefined,
    title: newTitle,
  }
  return putNote(newNote)
}

// --- Helpers ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function extractWikilinks(content: string): string[] {
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
  const links: string[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    links.push(m[1].trim())
  }
  return [...new Set(links)]
}

export function extractTags(content: string): string[] {
  const re = /(?:^|\s)#([a-zA-Z][\w/-]*)/g
  const tags: string[] = []
  let m
  while ((m = re.exec(content)) !== null) {
    tags.push(m[1])
  }
  return [...new Set(tags)]
}

export function noteIdFromTitle(title: string, allNotes: VaultNote[]): string | null {
  const lower = title.toLowerCase()
  const found = allNotes.find(
    (n) =>
      n.title.toLowerCase() === lower ||
      n._id.replace(/\.md$/, '').split('/').pop()?.toLowerCase() === lower,
  )
  return found?._id ?? null
}
