import type { VaultNote } from '@/pages/notes/types'

const STORAGE_KEY = 'mc-notes-vault'
const COUCHDB_URL = import.meta.env.VITE_COUCHDB_URL || ''
const COUCHDB_DB = import.meta.env.VITE_COUCHDB_DB || ''
const COUCHDB_USER = import.meta.env.VITE_COUCHDB_USER || ''
const COUCHDB_PASS = import.meta.env.VITE_COUCHDB_PASSWORD || ''

const BASE = `${COUCHDB_URL}/${COUCHDB_DB}`
const AUTH_HEADER = COUCHDB_USER
  ? 'Basic ' + btoa(`${COUCHDB_USER}:${COUCHDB_PASS}`)
  : ''

// --- Local storage cache ---

function loadLocal(): Map<string, VaultNote> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const arr: VaultNote[] = JSON.parse(raw)
    return new Map(arr.map((n) => [n._id, n]))
  } catch {
    return new Map()
  }
}

function saveLocal(notes: Map<string, VaultNote>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...notes.values()]))
}

let notesCache: Map<string, VaultNote> = loadLocal()

// --- CouchDB HTTP helpers ---

async function couchFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> || {}),
  }
  if (AUTH_HEADER) headers['Authorization'] = AUTH_HEADER

  return fetch(`${BASE}${path}`, { ...opts, headers })
}

// --- LiveSync document format ---
// Main docs: { _id: "file.md", type: "plain", path: "file.md", children: ["h:xxx", ...], ctime, mtime, size }
// Leaf docs: { _id: "h:xxx", type: "leaf", data: "content chunk" }
// To read a note: fetch main doc -> fetch each child leaf -> concatenate data fields

interface LiveSyncMainDoc {
  _id: string
  _rev: string
  type: 'plain' | 'newnote'
  path: string
  children: string[]
  ctime: number
  mtime: number
  size: number
  eden?: Record<string, unknown>
}

interface LiveSyncLeafDoc {
  _id: string
  _rev: string
  type: 'leaf'
  data: string
}

async function fetchNoteContent(children: string[]): Promise<string> {
  if (children.length === 0) return ''

  // Fetch all chunks in parallel
  const resp = await couchFetch('/_all_docs?include_docs=true', {
    method: 'POST',
    body: JSON.stringify({ keys: children }),
  })

  if (!resp.ok) return ''
  const data = await resp.json()

  // Concatenate in order
  const chunkMap = new Map<string, string>()
  for (const row of data.rows) {
    if (row.doc && row.doc.data != null) {
      chunkMap.set(row.doc._id, row.doc.data)
    }
  }

  return children.map((id) => chunkMap.get(id) ?? '').join('')
}

function titleFromPath(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.md$/, '')
}

function folderFromPath(path: string): string {
  const parts = path.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
}

// --- Pull from CouchDB (LiveSync format) ---

async function pullFromRemote(): Promise<VaultNote[]> {
  if (!AUTH_HEADER) return []
  try {
    const resp = await couchFetch('/_all_docs?include_docs=true')
    if (!resp.ok) return []
    const data = await resp.json()

    // Find all main docs (type: plain or newnote, with a path ending in .md)
    const mainDocs: LiveSyncMainDoc[] = data.rows
      .map((r: any) => r.doc)
      .filter((d: any) =>
        d &&
        !d._id.startsWith('_') &&
        !d._id.startsWith('h:') &&
        (d.type === 'plain' || d.type === 'newnote') &&
        d.path &&
        d.path.endsWith('.md'),
      )

    // Fetch content for each note
    const notes: VaultNote[] = await Promise.all(
      mainDocs.map(async (doc) => {
        const content = await fetchNoteContent(doc.children || [])
        return {
          _id: doc._id,
          _rev: doc._rev,
          type: 'note' as const,
          title: titleFromPath(doc.path),
          content,
          folder: folderFromPath(doc.path),
          tags: extractTags(content),
          links: extractWikilinks(content),
          created_at: doc.ctime,
          updated_at: doc.mtime,
        }
      }),
    )

    return notes
  } catch (err) {
    console.warn('[vault] pull from remote failed:', err)
    return []
  }
}

// --- Write to CouchDB (LiveSync format) ---

async function pushToRemote(note: VaultNote): Promise<void> {
  if (!AUTH_HEADER) return
  try {
    const docId = note._id

    // Check if main doc exists
    const existing = await couchFetch(`/${encodeURIComponent(docId)}`)
    let oldChildren: string[] = []
    let rev: string | undefined

    if (existing.ok) {
      const oldDoc = await existing.json()
      oldChildren = oldDoc.children || []
      rev = oldDoc._rev
    }

    // Delete old leaf chunks
    for (const childId of oldChildren) {
      try {
        const childResp = await couchFetch(`/${encodeURIComponent(childId)}`)
        if (childResp.ok) {
          const child = await childResp.json()
          await couchFetch(`/${encodeURIComponent(childId)}?rev=${child._rev}`, {
            method: 'DELETE',
          })
        }
      } catch { /* ignore */ }
    }

    // Create new leaf chunk with full content
    const chunkId = `h:${crypto.randomUUID().replace(/-/g, '').slice(0, 13)}`
    await couchFetch(`/${encodeURIComponent(chunkId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        _id: chunkId,
        type: 'leaf',
        data: note.content,
      }),
    })

    // Create/update main doc
    const mainDoc: Record<string, unknown> = {
      _id: docId,
      type: 'plain',
      path: docId,
      children: [chunkId],
      ctime: note.created_at,
      mtime: Date.now(),
      size: new Blob([note.content]).size,
      eden: {},
    }
    if (rev) mainDoc._rev = rev

    await couchFetch(`/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      body: JSON.stringify(mainDoc),
    })
  } catch (err) {
    console.warn('[vault] push to remote failed:', err)
  }
}

async function deleteFromRemote(id: string): Promise<void> {
  if (!AUTH_HEADER) return
  try {
    const resp = await couchFetch(`/${encodeURIComponent(id)}`)
    if (!resp.ok) return
    const doc = await resp.json()

    // Delete leaf chunks
    for (const childId of doc.children || []) {
      try {
        const childResp = await couchFetch(`/${encodeURIComponent(childId)}`)
        if (childResp.ok) {
          const child = await childResp.json()
          await couchFetch(`/${encodeURIComponent(childId)}?rev=${child._rev}`, {
            method: 'DELETE',
          })
        }
      } catch { /* ignore */ }
    }

    // Delete main doc
    await couchFetch(`/${encodeURIComponent(id)}?rev=${doc._rev}`, {
      method: 'DELETE',
    })
  } catch (err) {
    console.warn('[vault] delete from remote failed:', err)
  }
}

// --- Sync ---

let syncInterval: ReturnType<typeof setInterval> | null = null

export function startSync(onChange?: () => void) {
  if (syncInterval) return
  // Initial pull
  pullFromRemote().then((remote) => {
    if (remote.length > 0) {
      notesCache = new Map(remote.map((n) => [n._id, n]))
      saveLocal(notesCache)
      onChange?.()
    }
  })
  // Poll every 30s
  syncInterval = setInterval(async () => {
    const remote = await pullFromRemote()
    if (remote.length > 0) {
      let changed = false
      for (const note of remote) {
        const local = notesCache.get(note._id)
        if (!local || note.updated_at > local.updated_at) {
          notesCache.set(note._id, note)
          changed = true
        }
      }
      if (changed) {
        saveLocal(notesCache)
        onChange?.()
      }
    }
  }, 30_000)
}

export function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
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
  saveLocal(notesCache)

  // Sync to remote in background
  pushToRemote(doc).catch(() => {})

  return doc
}

export async function deleteNote(id: string): Promise<void> {
  notesCache.delete(id)
  saveLocal(notesCache)
  deleteFromRemote(id).catch(() => {})
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
