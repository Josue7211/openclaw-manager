import type { VaultNote } from '@/pages/notes/types'

/**
 * Vault — local-only note storage backed by an in-memory cache.
 *
 * SECURITY: CouchDB credentials were previously embedded in the frontend
 * bundle (VITE_COUCHDB_USER / VITE_COUCHDB_PASSWORD). These have been
 * removed. Remote sync should be proxied through the Axum backend
 * (TODO: add /api/vault/* routes to src-tauri/src/routes/).
 *
 * Note content is NOT stored in localStorage — only metadata (id, title,
 * folder, tags, links, timestamps) is cached for offline list rendering.
 * Full content is held in memory only and fetched from the backend on load.
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

function loadMetaCache(): Map<string, NoteMeta> {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY)
    if (!raw) return new Map()
    const arr: NoteMeta[] = JSON.parse(raw)
    return new Map(arr.map((m) => [m._id, m]))
  } catch {
    return new Map()
  }
}

function saveMetaCache(meta: Map<string, NoteMeta>) {
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify([...meta.values()]))
}

// In-memory note cache (includes content — never persisted to localStorage)
let notesCache: Map<string, VaultNote> = new Map()
let metaCache: Map<string, NoteMeta> = loadMetaCache()

// Hydrate notes from meta cache on startup (content will be empty until fetched)
for (const [id, meta] of metaCache) {
  notesCache.set(id, {
    ...meta,
    _id: meta._id,
    type: 'note',
    content: '',
  })
}

// --- Sync (stub — requires backend proxy) ---

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function startSync(_onChange?: () => void) {
  // TODO: implement sync via Axum backend proxy (/api/vault/*)
  // Remote CouchDB sync was removed because credentials were embedded
  // in the frontend bundle. Add backend routes and call them here.
}

export function stopSync() {
  // No-op until backend sync is implemented
}

// --- CRUD ---

export async function getAllNotes(): Promise<VaultNote[]> {
  return [...notesCache.values()]
    .filter((n) => n.type === 'note')
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function getNote(id: string): Promise<VaultNote | null> {
  return notesCache.get(id) ?? null
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

  notesCache.set(doc._id, doc)
  metaCache.set(doc._id, toMeta(doc))
  saveMetaCache(metaCache)

  return doc
}

export async function deleteNote(id: string): Promise<void> {
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
