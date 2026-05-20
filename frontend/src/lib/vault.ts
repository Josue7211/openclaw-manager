import type { VaultFolder, VaultNote } from '@/features/notes/types'
import { api } from '@/lib/api'

/**
 * Vault — local-first note storage backed by the app's SQLite vault.
 *
 * Local routes under /api/vault/local/* are canonical. Legacy CouchDB routes
 * are used only for one-time import/compatibility reads when the local vault is
 * empty, never as a silent owner for failed local writes.
 */

const META_STORAGE_KEY = 'mc-notes-meta'
const FOLDER_STORAGE_KEY = 'mc-notes-folders'
const DRAFT_STORAGE_KEY = 'mc-notes-drafts'
const FOLDER_DOC_PREFIX = 'cc:folder:'
const LOCAL_VAULT_PREFIX = '/api/vault/local'

interface NoteMeta {
  _id: string
  _rev?: string
  title: string
  folder: string
  tags: string[]
  links: string[]
  aliases?: string[]
  properties?: Record<string, string | string[]>
  created_at: number
  updated_at: number
  trashed_at?: number | null
  trash_origin_path?: string | null
}

interface FolderMeta {
  _id: string
  _rev?: string
  type: 'folder'
  path: string
  name: string
  created_at: number
  updated_at: number
  trashed_at?: number | null
  trash_origin_path?: string | null
}

interface NoteDraft {
  id: string
  content: string
  updated_at: number
}

export interface VaultAttachmentUpload {
  id: string
  rev?: string
  mime: string
  size: number
  created_at: number
}

export interface VaultRevision {
  rev: string
  status: 'available' | 'missing' | 'deleted' | string
  version_number?: number
  label?: string | null
  created_at?: number
  created_by?: string
  reason?: string
  checksum?: string
}

export interface VaultRevisionDetail extends VaultRevision {
  document_id: string
  content: string
  content_json?: string | null
  metadata?: Record<string, unknown>
}

export interface VaultComment {
  id: string
  document_id: string
  anchor?: Record<string, unknown>
  body: string
  status: 'open' | 'resolved' | string
  created_at: number
  updated_at: number
  resolved_at?: number | null
  replies?: VaultCommentReply[]
}

export interface VaultCommentReply {
  id: string
  comment_id: string
  document_id: string
  body: string
  created_at: number
  updated_at: number
}

export interface VaultSuggestion {
  id: string
  document_id: string
  anchor?: Record<string, unknown>
  patch: Record<string, unknown>
  status: 'open' | 'applied' | 'rejected' | string
  created_at: number
  applied_at?: number | null
}

export interface VaultEncryptedBackup {
  format: 'clawcontrol-encrypted-vault-backup' | string
  version: number
  created_at: string
  encryption: {
    algorithm: string
    kdf: string
    salt: string
    nonce: string
  }
  ciphertext: string
}

export interface VaultImportStats {
  imported_notes: number
  imported_folders: number
  imported_attachments?: number
  imported_versions?: number
  imported_comments?: number
  imported_comment_replies?: number
  imported_suggestions?: number
  imported_audit_events?: number
  imported_save_queue?: number
  imported_sync_state?: number
}

export interface VaultStatus {
  canonical_store: 'local_sqlite' | string
  remote_required: boolean
  encrypted_backup_supported: boolean
  database_path: string
  attachments_path: string
  counts: {
    live_notes: number
    trashed_notes: number
    folders: number
    attachments: number
    attachment_bytes: number
    versions: number
    open_comments: number
    open_suggestions: number
    pending_saves: number
    audit_events: number
  }
}

export interface VaultRecoverableDraft {
  id: string
  title: string
  folder: string
  content: string
  updated_at: number
}

export interface VaultAuditEvent {
  id: string
  document_id?: string | null
  action: string
  metadata: Record<string, unknown>
  created_at: number
}

export interface VaultSyncLedger {
  pending_saves: Array<{
    id: string
    document_id: string
    operation: string
    payload: Record<string, unknown>
    created_at: number
    attempts: number
    last_error?: string | null
  }>
  sync_states: Array<{
    provider: string
    remote_id: string
    local_id: string
    remote_rev?: string | null
    last_synced_at?: number | null
    conflict_state: string
    conflict: Record<string, unknown>
  }>
}

export interface VaultCollaborationPeer {
  id: string
  name: string
  seenAt: number
  cursor?: {
    anchor: number
    head: number
    updatedAt: number
  }
}

export interface VaultCollaborationEvent {
  protocol: 'clawcontrol-notes-local-collab'
  version: 1
  eventId: string
  clientId: string
  sequence: number
  type: 'presence' | 'leave' | 'draft' | 'operation' | 'cursor'
  documentId: string
  peer: VaultCollaborationPeer
  content?: string
  baseChecksum?: string
  contentChecksum?: string
  operations?: VaultCollaborationOperation[]
  crdtOperations?: VaultCollaborationCrdtOperation[]
  richOperations?: VaultCollaborationRichTextOperation[]
  cursor?: {
    anchor: number
    head: number
    updatedAt: number
  }
  updatedAt: number
}

export interface VaultCollaborationOperation {
  id: string
  baseChecksum: string
  baseStart: number
  baseEnd: number
  insert: string
  checksum: string
}

export type VaultCollaborationCrdtOperation =
  | { type: 'insert'; id: string; afterId: string | null; value: string }
  | { type: 'delete'; id: string }

export type VaultCollaborationRichTextBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'taskList'
  | 'table'
  | 'quote'
  | 'code'
  | 'horizontalRule'

export type VaultCollaborationRichTextOperation =
  | { type: 'insert'; id: string; afterId: string | null; blockType: VaultCollaborationRichTextBlockType; markdown: string }
  | { type: 'update'; id: string; blockType: VaultCollaborationRichTextBlockType; markdown: string }
  | {
      type: 'mark'
      id: string
      mark: 'bold' | 'italic' | 'code' | 'link' | 'strike' | 'underline' | 'highlight' | 'color'
      textStart: number
      textEnd: number
      href?: string
      color?: string
    }
  | { type: 'tableCell'; id: string; row: number; column: number; markdown: string }
  | { type: 'tableRow'; id: string; index: number; cells: string[] }
  | { type: 'tableRowDelete'; id: string; index: number; cells: string[] }
  | { type: 'tableColumn'; id: string; index: number; cells: string[] }
  | { type: 'tableColumnDelete'; id: string; index: number; cells: string[] }
  | { type: 'listItem'; id: string; index: number; markdown: string }
  | { type: 'listItemInsert'; id: string; index: number; markdown: string }
  | { type: 'listItemDelete'; id: string; index: number; markdown: string }
  | { type: 'line'; id: string; index: number; markdown: string }
  | { type: 'lineInsert'; id: string; index: number; markdown: string }
  | { type: 'lineDelete'; id: string; index: number; markdown: string }
  | { type: 'delete'; id: string }

export interface VaultCollaborationCrdtCharacter {
  id: string
  afterId: string | null
  value: string
  deleted?: boolean
}

export interface VaultCollaborationCrdtState {
  documentId: string
  characters: VaultCollaborationCrdtCharacter[]
  checksum: string
  clientId?: string | null
  sequence: number
  updatedAt: number
}

export interface VaultCollaborationHttpTransportOptions {
  baseUrl: string
  apiKey?: string
  pairingKey?: string
  timeoutMs?: number
}

export interface VaultCollaborationProviderHealth {
  ok: boolean
  checkedAt: number
  readiness: 'ready' | 'idle' | 'unpaired' | 'degraded' | 'wrong-store' | 'unreachable'
  readinessLabel: string
  readinessDetail: string
  readinessSeverity: 'success' | 'warning' | 'danger'
  canonicalStore?: string
  remoteRequired?: boolean
  pairingApproved?: boolean
  events?: boolean
  crdtSnapshots?: boolean
  counts?: {
    approvedPairings: number
    activeEvents: number
    crdtSnapshots: number
  }
  lastEventAt?: number | null
  lastSnapshotAt?: number | null
  lastPairingSeenAt?: number | null
  error?: string
}

export interface VaultCollaborationPairing {
  id: string
  deviceLabel: string
  status: 'approved' | 'revoked' | string
  keyFingerprint: string
  createdAt: number
  updatedAt: number
  approvedAt?: number | null
  revokedAt?: number | null
  lastSeenAt?: number | null
}

function toMeta(note: VaultNote): NoteMeta {
  return {
    _id: note._id,
    _rev: note._rev,
    title: note.title,
    folder: note.folder,
    tags: note.tags,
    links: note.links,
    aliases: note.aliases,
    properties: note.properties,
    created_at: note.created_at,
    updated_at: note.updated_at,
    trashed_at: note.trashed_at,
    trash_origin_path: note.trash_origin_path,
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
    trashed_at: folder.trashed_at,
    trash_origin_path: folder.trash_origin_path,
  }
}

/** Internal LiveSync prefixes that should never appear as user notes. */
const INTERNAL_PREFIXES = [
  'h:',
  '_design/',
  'ps:',
  'ix:',
  'cc:',
  '.obsidian/',
  '.obsidian-livesync/',
  'obsydian_livesync',
  '!:',
]

function isInternalDoc(id: string): boolean {
  return INTERNAL_PREFIXES.some(p => id.startsWith(p))
}

function loadMetaCache(): Map<string, NoteMeta> {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY)
    if (!raw) return new Map()
    const arr: NoteMeta[] = JSON.parse(raw)
    // Filter out stale LiveSync internal docs that may have been cached previously
    const filtered = arr.filter(m => !isInternalDoc(m._id))
    return new Map(filtered.map(m => [m._id, m]))
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
    return folderListToMap(arr)
  } catch {
    return new Map()
  }
}

function saveFolderCache(folders: Map<string, VaultFolder>) {
  const normalizedFolders = [...folderListToMap([...folders.values()]).values()]
  localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(normalizedFolders.map(toFolderMeta)))
}

function loadDraftCache(): Map<string, NoteDraft> {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return new Map()
    const arr: NoteDraft[] = JSON.parse(raw)
    return new Map(arr.map(draft => [draft.id, draft]))
  } catch {
    return new Map()
  }
}

function saveDraftCache(drafts: Map<string, NoteDraft>) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify([...drafts.values()]))
}

export function saveLocalDraft(id: string, content: string) {
  const drafts = loadDraftCache()
  drafts.set(id, { id, content, updated_at: Date.now() })
  saveDraftCache(drafts)
}

export function discardLocalDraft(id: string) {
  clearLocalDraft(id)
}

function clearLocalDraft(id: string) {
  const drafts = loadDraftCache()
  if (!drafts.delete(id)) return
  saveDraftCache(drafts)
}

function applyLocalDraft(note: VaultNote): VaultNote {
  if (note.type !== 'note') return note
  const draft = loadDraftCache().get(note._id)
  if (!draft || (draft.updated_at < note.updated_at && note.content)) return note
  return {
    ...note,
    content: draft.content,
    updated_at: draft.updated_at,
  }
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
    _rev: meta._rev,
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
  const storedFolder = (doc.folder as string) || (doc.path as string)?.split('/').slice(0, -1).join('/') || ''
  const tags = Array.isArray(doc.tags)
    ? doc.tags
    : [...new Set([...extractTags(content), ...frontmatterTags(frontmatter.properties)])]
  const links = Array.isArray(doc.links) ? doc.links : extractWikilinks(content)
  const aliases = Array.isArray(doc.aliases)
    ? doc.aliases.filter((alias): alias is string => typeof alias === 'string')
    : frontmatterAliases(frontmatter.properties)
  const created = (doc.created_at as number) || (doc.ctime as number) || Date.now()
  const updated = (doc.updated_at as number) || (doc.mtime as number) || Date.now()
  const trashedAt = (doc.trashed_at as number | null | undefined) ?? null
  const trashOriginPath = (doc.trash_origin_path as string | null | undefined) ?? null

  return {
    _id: id,
    _rev: doc._rev as string | undefined,
    type: 'note',
    title,
    content,
    folder: visibleTrashFolderPath(storedFolder, trashedAt, trashOriginPath),
    tags,
    links,
    aliases,
    properties: frontmatter.properties,
    created_at: created,
    updated_at: updated,
    trashed_at: trashedAt,
    trash_origin_path: trashOriginPath,
  }
}

function docToFolder(doc: Record<string, unknown>): VaultFolder | null {
  const id = (doc._id as string) || ''
  const rawPath = (doc.path as string) || pathFromFolderDocId(id)
  const trashedAt = (doc.trashed_at as number | null | undefined) ?? null
  const trashOriginPath = (doc.trash_origin_path as string | null | undefined) ?? null
  const path = visibleTrashFolderPath(rawPath, trashedAt, trashOriginPath)
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
    trashed_at: trashedAt,
    trash_origin_path: trashOriginPath,
  }
}

function normalizeFolderRecord(folder: VaultFolder | FolderMeta): VaultFolder | null {
  const path = visibleTrashFolderPath(folder.path, folder.trashed_at ?? null, folder.trash_origin_path ?? null)
  if (!path) return null
  const name = path.split('/').pop() || path
  return {
    ...folder,
    _id: folder._id || folderDocId(path),
    type: 'folder',
    path,
    name,
    trashed_at: folder.trashed_at ?? null,
    trash_origin_path: folder.trash_origin_path ?? null,
  }
}

function folderListToMap(folders: Array<VaultFolder | FolderMeta>): Map<string, VaultFolder> {
  const next = new Map<string, VaultFolder>()
  for (const folder of folders) {
    const normalized = normalizeFolderRecord(folder)
    if (!normalized) continue
    const existing = next.get(normalized.path)
    if (!existing || normalized.updated_at >= existing.updated_at) {
      next.set(normalized.path, normalized)
    }
  }
  return next
}

function attachmentRecordToNote(att: Record<string, unknown>): VaultNote | null {
  const id = String(att._id || att.id || '')
  if (!id || isInternalDoc(id)) return null
  const name = String(att.title || att.filename || id.split('/').pop() || id)
  const folder = normalizeFolderPath(
    String(att.folder || att.path || (id.includes('/') ? id.split('/').slice(0, -1).join('/') : '')),
  )
  return {
    _id: id,
    type: 'attachment',
    title: name,
    content: '',
    folder,
    tags: [],
    links: [],
    created_at: Number(att.created_at || 0),
    updated_at: Number(att.updated_at || att.created_at || 0),
    trashed_at: (att.trashed_at as number | null | undefined) ?? null,
    trash_origin_path: (att.trash_origin_path as string | null | undefined) ?? null,
  }
}

// --- Sync via backend proxy ---

async function fetchAllFromBackend(): Promise<VaultNote[]> {
  let json: any
  let localOk = false
  try {
    json = await api.get<any>(`${LOCAL_VAULT_PREFIX}/documents`)
    localOk = true
  } catch (err) {
    console.warn('[vault] local document list failed, using local cache:', err)
    return [...notesCache.values()]
  }
  const payload = json?.data || json || {}

  // New format: { notes: [...], attachments: [...] }
  const rawNotes = Array.isArray(payload.notes) ? payload.notes : Array.isArray(payload) ? payload : []
  const rawAttachments: Array<Record<string, unknown>> = Array.isArray(payload.attachments) ? payload.attachments : []

  const notes = rawNotes.map(docToNote).filter((n: VaultNote) => !isInternalDoc(n._id))

  if (localOk && notes.length === 0) {
    const imported = await importLegacyVaultIfPresent()
    if (imported.length > 0) return imported
  }

  for (const att of rawAttachments) {
    const attachment = attachmentRecordToNote(att)
    if (attachment) notes.push(attachment)
  }

  return notes
}

async function importLegacyVaultIfPresent(): Promise<VaultNote[]> {
  try {
    const [legacyNotesJson, legacyFoldersJson] = await Promise.all([
      api.get<any>('/api/vault/notes'),
      api.get<any>('/api/vault/folders').catch(() => ({ data: { folders: [] } })),
    ])
    const legacyNotesPayload = legacyNotesJson?.data || legacyNotesJson || {}
    const legacyFoldersPayload = legacyFoldersJson?.data || legacyFoldersJson || {}
    const legacyRawNotes = Array.isArray(legacyNotesPayload.notes)
      ? legacyNotesPayload.notes
      : Array.isArray(legacyNotesPayload)
        ? legacyNotesPayload
        : []
    const legacyFolders = Array.isArray(legacyFoldersPayload.folders) ? legacyFoldersPayload.folders : []
    const legacyNotes = legacyRawNotes
      .map(docToNote)
      .filter((note: VaultNote) => note.type === 'note' && !isInternalDoc(note._id))
    if (legacyNotes.length === 0 && legacyFolders.length === 0) return []

    await api.post<any>(`${LOCAL_VAULT_PREFIX}/import`, {
      notes: legacyNotes,
      folders: legacyFolders,
    })
    const importedFolders = legacyFolders
      .map(docToFolder)
      .filter((folder: VaultFolder | null): folder is VaultFolder => !!folder)
    if (importedFolders.length > 0) {
      foldersCache.clear()
      for (const folder of folderListToMap(importedFolders).values()) foldersCache.set(folder.path, folder)
      saveFolderCache(foldersCache)
    }
    return legacyNotes
  } catch (err) {
    console.warn('[vault] legacy vault import skipped:', err)
    return []
  }
}

async function fetchFoldersFromBackend(): Promise<VaultFolder[]> {
  try {
    const json = await api.get<any>(`${LOCAL_VAULT_PREFIX}/folders`)
    const payload = json?.data || json || {}
    const rawFolders = Array.isArray(payload.folders) ? payload.folders : []
    const folders = rawFolders.map(docToFolder).filter((folder: VaultFolder | null): folder is VaultFolder => !!folder)
    return [...folderListToMap(folders).values()]
  } catch (err) {
    console.warn('[vault] folder list failed, using local cache:', err)
    return [...folderListToMap([...foldersCache.values()]).values()]
  }
}

export function startSync(onChange?: () => void) {
  if (syncInterval) return
  syncInterval = setInterval(async () => {
    const [notes, folders] = await Promise.all([fetchAllFromBackend(), fetchFoldersFromBackend()])
    if (notes.length > 0 || folders.length > 0) {
      notesCache.clear()
      metaCache.clear()
      for (const note of notes) {
        const withDraft = applyLocalDraft(note)
        notesCache.set(withDraft._id, withDraft)
        metaCache.set(withDraft._id, toMeta(withDraft))
      }
      foldersCache.clear()
      for (const folder of folderListToMap(folders).values()) {
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
        const withDraft = applyLocalDraft(note)
        notesCache.set(withDraft._id, withDraft)
        metaCache.set(withDraft._id, toMeta(withDraft))
      }
      saveMetaCache(metaCache)
    }
    hasFetchedFromBackend = true
  }
  return [...notesCache.values()]
    .map(applyLocalDraft)
    .filter(n => n.type === 'note' || n.type === 'attachment')
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function getAllFolders(): Promise<VaultFolder[]> {
  if (!hasFetchedFoldersFromBackend) {
    const folders = await fetchFoldersFromBackend()
    if (folders.length > 0) {
      foldersCache.clear()
      for (const folder of folderListToMap(folders).values()) {
        foldersCache.set(folder.path, folder)
      }
      saveFolderCache(foldersCache)
    }
    hasFetchedFoldersFromBackend = true
  }
  return [...folderListToMap([...foldersCache.values()]).values()].sort((a, b) => a.path.localeCompare(b.path))
}

export function getRecoverableDrafts(): VaultRecoverableDraft[] {
  return [...loadDraftCache().values()]
    .map(draft => {
      const note = notesCache.get(draft.id)
      const meta = metaCache.get(draft.id)
      return {
        id: draft.id,
        title: note?.title || meta?.title || draft.id.replace(/\.md$/, '').split('/').pop() || draft.id,
        folder: note?.folder || meta?.folder || '',
        content: draft.content,
        updated_at: draft.updated_at,
      }
    })
    .sort((a, b) => b.updated_at - a.updated_at)
}

export async function restoreLocalDraft(id: string): Promise<VaultNote> {
  const draft = loadDraftCache().get(id)
  if (!draft) throw new Error('Draft not found')
  const note = notesCache.get(id)
  if (!note || note.type === 'attachment') throw new Error('Note not found')
  return putNote({ ...note, content: draft.content, updated_at: draft.updated_at })
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

  let remoteSaved = false
  try {
    const body: Record<string, unknown> = { ...doc }
    const result = await api.put<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(doc._id)}`, body)
    const data = result?.data || result
    if (data?.rev) doc._rev = data.rev
    remoteSaved = true
  } catch (err) {
    console.warn('[vault] put failed, saved locally:', err)
  }

  notesCache.set(doc._id, doc)
  metaCache.set(doc._id, toMeta(doc))
  saveMetaCache(metaCache)
  if (remoteSaved) {
    clearLocalDraft(doc._id)
  } else {
    saveLocalDraft(doc._id, doc.content)
  }

  return doc
}

export async function uploadAttachment(
  file: File,
  folder = 'attachments',
  id?: string,
): Promise<VaultAttachmentUpload> {
  const dataUrl = await fileToDataUrl(file)
  const normalizedFolder = normalizeFolderPath(folder) || 'attachments'
  let result: any
  try {
    result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/attachment`, {
      id,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      folder: normalizedFolder,
      data: dataUrl,
    })
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Local attachment upload failed')
  }
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
    trashed_at: null,
    trash_origin_path: null,
  })
  return uploaded
}

export async function deleteNote(id: string): Promise<void> {
  const note = notesCache.get(id)
  try {
    if (note?.type === 'attachment') {
      await api.del(`${LOCAL_VAULT_PREFIX}/attachment?id=${encodeURIComponent(id)}`)
    } else {
      await api.del(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(id)}`)
    }
  } catch (err) {
    console.warn('[vault] delete failed:', err)
    throw err
  }
  notesCache.delete(id)
  metaCache.delete(id)
  clearLocalDraft(id)
  saveMetaCache(metaCache)
}

export async function trashNote(id: string): Promise<void> {
  const note = notesCache.get(id)
  if (note?.type === 'attachment') {
    try {
      await api.post<any>(`${LOCAL_VAULT_PREFIX}/attachment/trash?id=${encodeURIComponent(id)}`, {})
    } catch (err) {
      console.warn('[vault] local attachment trash failed:', err)
      throw err
    }
    const origin = note.folder
    const trashed = {
      ...note,
      folder: origin ? `Trash/${origin}` : 'Trash',
      trash_origin_path: origin,
      trashed_at: Date.now(),
      updated_at: Date.now(),
    }
    notesCache.set(id, trashed)
    metaCache.set(id, toMeta(trashed))
    saveMetaCache(metaCache)
    return
  }
  try {
    await api.post<any>(`${LOCAL_VAULT_PREFIX}/trash?id=${encodeURIComponent(id)}`, {})
  } catch (err) {
    console.warn('[vault] trash failed:', err)
    throw err
  }

  if (note) {
    const origin = note.folder
    const trashed = {
      ...note,
      folder: origin ? `Trash/${origin}` : 'Trash',
      trash_origin_path: note.trash_origin_path ?? origin,
      trashed_at: note.trashed_at ?? Date.now(),
      updated_at: Date.now(),
    }
    notesCache.set(id, trashed)
    metaCache.set(id, toMeta(trashed))
    saveMetaCache(metaCache)
  }
}

export async function restoreTrashedNote(id: string, folder?: string): Promise<VaultNote> {
  const cached = notesCache.get(id)
  if (cached?.type === 'attachment') {
    const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/attachment/trash/restore`, { id, folder })
    const payload = result?.data || result || {}
    const targetFolder = normalizeFolderPath(
      folder || cached.trash_origin_path || cached.folder.replace(/^Trash\/?/, ''),
    )
    const restored = {
      ...cached,
      folder: targetFolder,
      trashed_at: null,
      trash_origin_path: null,
      updated_at: Date.now(),
      _rev: payload.rev || cached._rev,
    }
    notesCache.set(id, restored)
    metaCache.set(id, toMeta(restored))
    saveMetaCache(metaCache)
    return restored
  }
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/trash/restore`, { id, folder })
  const payload = result?.data || result || {}
  const restored = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(id)}`)
  const note = docToNote(restored?.data || restored || payload)
  notesCache.set(note._id, note)
  metaCache.set(note._id, toMeta(note))
  clearLocalDraft(note._id)
  saveMetaCache(metaCache)
  return note
}

export async function trashFolder(path: string): Promise<void> {
  const normalized = normalizeFolderPath(path)
  if (!normalized) return
  try {
    await api.post<any>(`${LOCAL_VAULT_PREFIX}/folder/trash?path=${encodeURIComponent(normalized)}`, {})
  } catch (err) {
    console.warn('[vault] local folder trash failed, falling back to folder cache only:', err)
  }
  const now = Date.now()
  const affectedFolders = [...foldersCache.values()].filter(
    folder => folder.path === normalized || folder.path.startsWith(`${normalized}/`),
  )
  for (const folder of affectedFolders) {
    foldersCache.delete(folder.path)
    const trashed = {
      ...folder,
      path: `Trash/${folder.path}`,
      trash_origin_path: folder.path,
      trashed_at: now,
    }
    foldersCache.set(trashed.path, trashed)
  }
  for (const note of [...notesCache.values()]) {
    const folder = noteFolderPath(note)
    if (isInsideFolderPath(folder, normalized)) {
      const trashed = {
        ...note,
        folder: folder ? `Trash/${folder}` : 'Trash',
        trash_origin_path: note.trash_origin_path ?? folder,
        trashed_at: note.trashed_at ?? now,
        updated_at: now,
      }
      notesCache.set(note._id, trashed)
      metaCache.set(note._id, toMeta(trashed))
    }
  }
  saveFolderCache(foldersCache)
  saveMetaCache(metaCache)
}

export async function restoreTrashedFolder(path: string): Promise<void> {
  const normalized = normalizeFolderPath(path)
  if (!normalized) return
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/folder/trash/restore`, { path: normalized })
  const now = Date.now()
  const origin = normalized.startsWith('Trash/') ? normalized.slice('Trash/'.length) : normalized
  for (const folder of [...foldersCache.values()]) {
    const visiblePath = visibleFolderRecordPath(folder)
    if (visiblePath === normalized || visiblePath.startsWith(`${normalized}/`)) {
      foldersCache.delete(folder.path)
      const suffix = visiblePath === normalized ? '' : visiblePath.slice(normalized.length)
      const restored = {
        ...folder,
        path: `${origin}${suffix}`,
        trash_origin_path: null,
        trashed_at: null,
        updated_at: now,
      }
      foldersCache.set(restored.path, restored)
    }
  }
  for (const note of [...notesCache.values()]) {
    const visibleFolder = noteFolderPath(note)
    if (visibleFolder === normalized || visibleFolder.startsWith(`${normalized}/`)) {
      const suffix = visibleFolder === normalized ? '' : visibleFolder.slice(normalized.length)
      const restored = {
        ...note,
        folder: `${origin}${suffix}`,
        trash_origin_path: null,
        trashed_at: null,
        updated_at: now,
      }
      notesCache.set(note._id, restored)
      metaCache.set(note._id, toMeta(restored))
    }
  }
  saveFolderCache(foldersCache)
  saveMetaCache(metaCache)
}

export async function emptyTrash(): Promise<number> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/trash/empty`, {})
  const payload = result?.data || result || {}
  const trashedIds = [...notesCache.values()]
    .filter(note => isTrashFolderPath(noteFolderPath(note)))
    .map(note => note._id)
  for (const id of trashedIds) {
    notesCache.delete(id)
    metaCache.delete(id)
    clearLocalDraft(id)
  }
  for (const folder of [...foldersCache.values()]) {
    if (isTrashFolderPath(visibleFolderRecordPath(folder))) {
      foldersCache.delete(folder.path)
    }
  }
  saveMetaCache(metaCache)
  saveFolderCache(foldersCache)
  return Number(payload.deleted || trashedIds.length || 0)
}

export async function getVaultStatus(): Promise<VaultStatus> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/status`)
  const payload = result?.data || result || {}
  return payload
}

export async function getVaultAuditEvents(limit = 50, id?: string): Promise<VaultAuditEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (id) params.set('id', id)
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/audit?${params.toString()}`)
  const payload = result?.data || result || {}
  return Array.isArray(payload.events)
    ? payload.events.map((event: any) => ({
        id: String(event.id || crypto.randomUUID()),
        document_id: event.document_id ?? null,
        action: String(event.action || 'unknown'),
        metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
        created_at: Number(event.created_at || 0),
      }))
    : []
}

export async function getVaultSyncLedger(limit = 50): Promise<VaultSyncLedger> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/sync-ledger?limit=${encodeURIComponent(String(limit))}`)
  const payload = result?.data || result || {}
  return {
    pending_saves: Array.isArray(payload.pending_saves)
      ? payload.pending_saves.map((item: any) => ({
          id: String(item.id || crypto.randomUUID()),
          document_id: String(item.document_id || ''),
          operation: String(item.operation || 'save'),
          payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
          created_at: Number(item.created_at || 0),
          attempts: Number(item.attempts || 0),
          last_error: item.last_error ?? null,
        }))
      : [],
    sync_states: Array.isArray(payload.sync_states)
      ? payload.sync_states.map((item: any) => ({
          provider: String(item.provider || 'local'),
          remote_id: String(item.remote_id || ''),
          local_id: String(item.local_id || ''),
          remote_rev: item.remote_rev ?? null,
          last_synced_at: item.last_synced_at ?? null,
          conflict_state: String(item.conflict_state || 'clean'),
          conflict: item.conflict && typeof item.conflict === 'object' ? item.conflict : {},
        }))
      : [],
  }
}

export async function listVaultCollaborationEvents(id: string, since = 0): Promise<VaultCollaborationEvent[]> {
  const params = new URLSearchParams({ id, since: String(since), limit: '200' })
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/collaboration/events?${params.toString()}`)
  const payload = result?.data || result || {}
  return parseVaultCollaborationEvents(payload)
}

export async function publishVaultCollaborationEvent(event: VaultCollaborationEvent): Promise<void> {
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/collaboration/events`, {
    document_id: event.documentId,
    event_id: event.eventId,
    client_id: event.clientId,
    sequence: event.sequence,
    type: event.type,
    peer_id: event.peer.id,
    peer_name: event.peer.name,
    peer_seen_at: event.peer.seenAt,
    content: event.content,
    base_checksum: event.baseChecksum,
    content_checksum: event.contentChecksum,
    operations: event.operations,
    crdt_operations: event.crdtOperations,
    rich_operations: event.richOperations,
    cursor: event.cursor,
    updated_at: event.updatedAt,
    ttl_ms: event.type === 'leave' ? 30_000 : 90_000,
  })
}

export async function getVaultCollaborationCrdtState(id: string): Promise<VaultCollaborationCrdtState | null> {
  const params = new URLSearchParams({ id })
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/collaboration/crdt-state?${params.toString()}`)
  const payload = result?.data || result || {}
  return parseVaultCollaborationCrdtStatePayload(payload, id)
}

export async function getVaultCollaborationPairings(): Promise<VaultCollaborationPairing[]> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/collaboration/pairings`)
  const payload = result?.data || result || {}
  return parseVaultCollaborationPairings(payload)
}

export async function approveVaultCollaborationPairing(
  pairingKey: string,
  deviceLabel?: string,
): Promise<VaultCollaborationPairing> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/collaboration/pairings`, {
    pairing_key: pairingKey,
    device_label: deviceLabel,
  })
  const payload = result?.data || result || {}
  return parseVaultCollaborationPairing(payload)
}

export async function revokeVaultCollaborationPairing(options: {
  pairingId?: string
  pairingKey?: string
}): Promise<{ revoked: number; revokedAt: number }> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/collaboration/pairings/revoke`, {
    pairing_id: options.pairingId,
    pairing_key: options.pairingKey,
  })
  const payload = result?.data || result || {}
  return {
    revoked: Number(payload.revoked || 0),
    revokedAt: Number(payload.revokedAt || Date.now()),
  }
}

export function createVaultCollaborationHttpTransport(options: VaultCollaborationHttpTransportOptions) {
  const baseUrl = normalizeRemoteVaultBase(options.baseUrl)
  const request = <T>(method: string, path: string, body?: unknown) =>
    remoteVaultRequest<T>(baseUrl, options, method, path, body)

  return {
    async publish(event: VaultCollaborationEvent): Promise<void> {
      await request('POST', `${LOCAL_VAULT_PREFIX}/collaboration/events`, {
        document_id: event.documentId,
        event_id: event.eventId,
        client_id: event.clientId,
        sequence: event.sequence,
        type: event.type,
        peer_id: event.peer.id,
        peer_name: event.peer.name,
        peer_seen_at: event.peer.seenAt,
        content: event.content,
        base_checksum: event.baseChecksum,
        content_checksum: event.contentChecksum,
        operations: event.operations,
        crdt_operations: event.crdtOperations,
        rich_operations: event.richOperations,
        cursor: event.cursor,
        updated_at: event.updatedAt,
        ttl_ms: event.type === 'leave' ? 30_000 : 90_000,
      })
    },
    async list(id: string, since = 0): Promise<VaultCollaborationEvent[]> {
      const params = new URLSearchParams({ id, since: String(since), limit: '200' })
      const payload = await request<any>('GET', `${LOCAL_VAULT_PREFIX}/collaboration/events?${params.toString()}`)
      return parseVaultCollaborationEvents(payload?.data || payload || {})
    },
    async getCrdtState(id: string): Promise<VaultCollaborationCrdtState | null> {
      const params = new URLSearchParams({ id })
      const payload = await request<any>('GET', `${LOCAL_VAULT_PREFIX}/collaboration/crdt-state?${params.toString()}`)
      return parseVaultCollaborationCrdtStatePayload(payload?.data || payload || {}, id)
    },
    async saveCrdtState(state: VaultCollaborationCrdtState): Promise<void> {
      await request('PUT', `${LOCAL_VAULT_PREFIX}/collaboration/crdt-state`, {
        document_id: state.documentId,
        state: state.characters,
        checksum: state.checksum,
        client_id: state.clientId,
        sequence: state.sequence,
        updated_at: state.updatedAt,
      })
    },
  }
}

export async function testVaultCollaborationRemoteProvider(
  options: VaultCollaborationHttpTransportOptions,
): Promise<VaultCollaborationProviderHealth> {
  const checkedAt = Date.now()
  try {
    const baseUrl = normalizeRemoteVaultBase(options.baseUrl)
    const payload = await remoteVaultRequest<any>(
      baseUrl,
      { ...options, timeoutMs: options.timeoutMs ?? 8_000 },
      'GET',
      `${LOCAL_VAULT_PREFIX}/collaboration/health`,
    )
    const status = payload?.data || payload || {}
    const canonicalStore = typeof status.canonical_store === 'string' ? status.canonical_store : undefined
    const counts = status.counts && typeof status.counts === 'object' ? status.counts : {}
    const pairingApproved = status.collaboration_pairing === 'approved'
    const events = status.events === true
    const crdtSnapshots = status.crdt_snapshots === true
    const ok = canonicalStore === 'local_sqlite' && pairingApproved && events && crdtSnapshots
    const healthCounts = {
      approvedPairings: Number(counts.approved_pairings || 0),
      activeEvents: Number(counts.active_events || 0),
      crdtSnapshots: Number(counts.crdt_snapshots || 0),
    }
    const readiness = classifyVaultCollaborationProviderHealth({
      ok,
      canonicalStore,
      pairingApproved,
      events,
      crdtSnapshots,
      counts: healthCounts,
    })
    return {
      ok,
      checkedAt,
      ...readiness,
      canonicalStore,
      remoteRequired: Boolean(status.remote_required),
      pairingApproved,
      events,
      crdtSnapshots,
      counts: healthCounts,
      lastEventAt: typeof status.lastEventAt === 'number' ? status.lastEventAt : null,
      lastSnapshotAt: typeof status.lastSnapshotAt === 'number' ? status.lastSnapshotAt : null,
      lastPairingSeenAt: typeof status.lastPairingSeenAt === 'number' ? status.lastPairingSeenAt : null,
      error: ok ? undefined : readiness.readinessDetail,
    }
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      readiness: 'unreachable',
      readinessLabel: 'Provider unreachable',
      readinessDetail: error instanceof Error ? error.message : 'Remote collaboration provider check failed',
      readinessSeverity: 'danger',
      error: error instanceof Error ? error.message : 'Remote collaboration provider check failed',
    }
  }
}

function classifyVaultCollaborationProviderHealth(status: {
  ok: boolean
  canonicalStore?: string
  pairingApproved: boolean
  events: boolean
  crdtSnapshots: boolean
  counts: { approvedPairings: number; activeEvents: number; crdtSnapshots: number }
}): Pick<VaultCollaborationProviderHealth, 'readiness' | 'readinessLabel' | 'readinessDetail' | 'readinessSeverity'> {
  if (status.canonicalStore !== 'local_sqlite') {
    return {
      readiness: 'wrong-store',
      readinessLabel: 'Wrong storage backend',
      readinessDetail: 'The provider did not confirm local SQLite as the canonical store.',
      readinessSeverity: 'danger',
    }
  }
  if (!status.pairingApproved || status.counts.approvedPairings < 1) {
    return {
      readiness: 'unpaired',
      readinessLabel: 'Pairing not approved',
      readinessDetail: 'Approve this pairing key on the remote provider before collaboration sync starts.',
      readinessSeverity: 'danger',
    }
  }
  if (!status.events || !status.crdtSnapshots) {
    return {
      readiness: 'degraded',
      readinessLabel: 'Collaboration routes incomplete',
      readinessDetail: 'The provider is reachable but did not confirm event and CRDT snapshot support.',
      readinessSeverity: 'danger',
    }
  }
  if (status.counts.activeEvents === 0 && status.counts.crdtSnapshots === 0) {
    return {
      readiness: 'idle',
      readinessLabel: 'Ready, no document activity yet',
      readinessDetail: 'The provider is paired and ready. Sync a note to create collaboration events and snapshots.',
      readinessSeverity: 'warning',
    }
  }
  return {
    readiness: 'ready',
    readinessLabel: 'Provider ready',
    readinessDetail: 'The provider is paired and has collaboration activity available.',
    readinessSeverity: 'success',
  }
}

function parseVaultCollaborationEvents(payload: any): VaultCollaborationEvent[] {
  return Array.isArray(payload.events)
    ? payload.events
        .filter((event: any) => event && typeof event === 'object')
        .map((event: any) => ({
          protocol: 'clawcontrol-notes-local-collab',
          version: 1,
          eventId: String(event.eventId || event.id || crypto.randomUUID()),
          clientId: String(event.clientId || event.client_id || event.peer?.id || ''),
          sequence: Number(event.sequence || event.updatedAt || 0),
          type:
            event.type === 'leave' || event.type === 'draft' || event.type === 'operation' || event.type === 'cursor'
              ? event.type
              : 'presence',
          documentId: String(event.documentId || ''),
          peer: {
            id: String(event.peer?.id || ''),
            name: String(event.peer?.name || 'Local editor'),
            seenAt: Number(event.peer?.seenAt || 0),
            cursor: parseVaultCollaborationCursor(event.peer?.cursor),
          },
          content: typeof event.content === 'string' ? event.content : undefined,
          baseChecksum: typeof event.baseChecksum === 'string' ? event.baseChecksum : undefined,
          contentChecksum: typeof event.contentChecksum === 'string' ? event.contentChecksum : undefined,
          operations: parseVaultCollaborationOperations(event.operations),
          crdtOperations: parseVaultCollaborationCrdtOperations(event.crdtOperations),
          richOperations: parseVaultCollaborationRichTextOperations(event.richOperations),
          cursor: parseVaultCollaborationCursor(event.cursor),
          updatedAt: Number(event.updatedAt || 0),
        }))
    : []
}

function parseVaultCollaborationCrdtStatePayload(payload: any, id: string): VaultCollaborationCrdtState | null {
  if (!payload.state) return null
  const characters = parseVaultCollaborationCrdtCharacters(payload.state)
  return {
    documentId: String(payload.documentId || id),
    characters,
    checksum: String(payload.checksum || ''),
    clientId: typeof payload.clientId === 'string' ? payload.clientId : null,
    sequence: Number(payload.sequence || 0),
    updatedAt: Number(payload.updatedAt || 0),
  }
}

function parseVaultCollaborationPairings(payload: any): VaultCollaborationPairing[] {
  return Array.isArray(payload.pairings)
    ? payload.pairings.map(parseVaultCollaborationPairing).filter((pairing: VaultCollaborationPairing) => pairing.id)
    : []
}

function parseVaultCollaborationPairing(payload: any): VaultCollaborationPairing {
  return {
    id: String(payload.id || ''),
    deviceLabel: String(payload.deviceLabel || 'Remote notes device'),
    status: String(payload.status || 'approved'),
    keyFingerprint: String(payload.keyFingerprint || ''),
    createdAt: Number(payload.createdAt || 0),
    updatedAt: Number(payload.updatedAt || payload.approvedAt || payload.revokedAt || Date.now()),
    approvedAt: payload.approvedAt ?? null,
    revokedAt: payload.revokedAt ?? null,
    lastSeenAt: payload.lastSeenAt ?? null,
  }
}

function normalizeRemoteVaultBase(value: string): string {
  const base = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(base)) throw new Error('Remote collaboration provider needs an HTTP(S) base URL')
  return base
}

async function remoteVaultRequest<T>(
  baseUrl: string,
  options: VaultCollaborationHttpTransportOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.apiKey?.trim()) headers['X-API-Key'] = options.apiKey.trim()
  if (options.pairingKey?.trim()) headers['X-Claw-Vault-Pairing-Key'] = options.pairingKey.trim()
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Remote collaboration provider returned ${response.status}${text ? `: ${text}` : ''}`)
    }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) return undefined as T
    return response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function saveVaultCollaborationCrdtState(state: VaultCollaborationCrdtState): Promise<void> {
  await api.put<any>(`${LOCAL_VAULT_PREFIX}/collaboration/crdt-state`, {
    document_id: state.documentId,
    state: state.characters,
    checksum: state.checksum,
    client_id: state.clientId,
    sequence: state.sequence,
    updated_at: state.updatedAt,
  })
}

function parseVaultCollaborationCursor(value: unknown): VaultCollaborationEvent['cursor'] {
  if (!value || typeof value !== 'object') return undefined
  const cursor = value as Record<string, unknown>
  const anchor = Number(cursor.anchor)
  const head = Number(cursor.head)
  const updatedAt = Number(cursor.updatedAt)
  if (!Number.isInteger(anchor) || anchor < 0) return undefined
  if (!Number.isInteger(head) || head < 0) return undefined
  if (!Number.isFinite(updatedAt)) return undefined
  return { anchor, head, updatedAt }
}

function parseVaultCollaborationOperations(value: unknown): VaultCollaborationOperation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const operations = value.flatMap((item): VaultCollaborationOperation[] => {
    if (!item || typeof item !== 'object') return []
    const operation = item as Record<string, unknown>
    const baseStart = Number(operation.baseStart)
    const baseEnd = Number(operation.baseEnd)
    if (typeof operation.id !== 'string') return []
    if (typeof operation.baseChecksum !== 'string') return []
    if (!Number.isInteger(baseStart) || baseStart < 0) return []
    if (!Number.isInteger(baseEnd) || baseEnd < baseStart) return []
    if (typeof operation.insert !== 'string') return []
    if (typeof operation.checksum !== 'string') return []
    return [
      {
        id: operation.id,
        baseChecksum: operation.baseChecksum,
        baseStart,
        baseEnd,
        insert: operation.insert,
        checksum: operation.checksum,
      },
    ]
  })
  return operations.length > 0 ? operations : undefined
}

function parseVaultCollaborationCrdtOperations(value: unknown): VaultCollaborationCrdtOperation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const operations = value.flatMap((item): VaultCollaborationCrdtOperation[] => {
    if (!item || typeof item !== 'object') return []
    const operation = item as Record<string, unknown>
    if (operation.type === 'insert') {
      if (typeof operation.id !== 'string') return []
      if (operation.afterId !== null && typeof operation.afterId !== 'string') return []
      if (typeof operation.value !== 'string' || operation.value.length === 0) return []
      const afterId: string | null = operation.afterId === null ? null : (operation.afterId as string)
      return [{ type: 'insert', id: operation.id, afterId, value: operation.value }]
    }
    if (operation.type === 'delete' && typeof operation.id === 'string') {
      return [{ type: 'delete', id: operation.id }]
    }
    return []
  })
  return operations.length > 0 ? operations : undefined
}

function parseVaultCollaborationRichTextOperations(value: unknown): VaultCollaborationRichTextOperation[] | undefined {
  if (!Array.isArray(value)) return undefined
  const operations = value.flatMap((item): VaultCollaborationRichTextOperation[] => {
    if (!item || typeof item !== 'object') return []
    const operation = item as Record<string, unknown>
    if (typeof operation.id !== 'string') return []
    if (operation.type === 'delete') return [{ type: 'delete', id: operation.id }]
    if (operation.type === 'tableCell') {
      const row = Number(operation.row)
      const column = Number(operation.column)
      if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: 'tableCell', id: operation.id, row, column, markdown: operation.markdown }]
    }
    if (operation.type === 'tableRow') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (!Array.isArray(operation.cells) || !operation.cells.every(cell => typeof cell === 'string')) return []
      return [{ type: 'tableRow', id: operation.id, index, cells: operation.cells }]
    }
    if (operation.type === 'tableRowDelete') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (!Array.isArray(operation.cells) || !operation.cells.every(cell => typeof cell === 'string')) return []
      return [{ type: 'tableRowDelete', id: operation.id, index, cells: operation.cells }]
    }
    if (operation.type === 'tableColumn' || operation.type === 'tableColumnDelete') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (!Array.isArray(operation.cells) || !operation.cells.every(cell => typeof cell === 'string')) return []
      return [{ type: operation.type, id: operation.id, index, cells: operation.cells }]
    }
    if (operation.type === 'listItem') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: 'listItem', id: operation.id, index, markdown: operation.markdown }]
    }
    if (operation.type === 'listItemInsert') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: 'listItemInsert', id: operation.id, index, markdown: operation.markdown }]
    }
    if (operation.type === 'listItemDelete') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: 'listItemDelete', id: operation.id, index, markdown: operation.markdown }]
    }
    if (operation.type === 'line') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: 'line', id: operation.id, index, markdown: operation.markdown }]
    }
    if (operation.type === 'lineInsert' || operation.type === 'lineDelete') {
      const index = Number(operation.index)
      if (!Number.isInteger(index) || index < 0) return []
      if (typeof operation.markdown !== 'string') return []
      return [{ type: operation.type, id: operation.id, index, markdown: operation.markdown }]
    }
    if (operation.type === 'mark') {
      if (!isVaultCollaborationRichTextMark(operation.mark)) return []
      const textStart = Number(operation.textStart)
      const textEnd = Number(operation.textEnd)
      if (!Number.isInteger(textStart) || !Number.isInteger(textEnd) || textStart < 0 || textEnd <= textStart) return []
      return [
        {
          type: 'mark',
          id: operation.id,
          mark: operation.mark,
          textStart,
          textEnd,
          href: typeof operation.href === 'string' ? operation.href : undefined,
          color: typeof operation.color === 'string' ? operation.color : undefined,
        },
      ]
    }
    if (operation.type !== 'insert' && operation.type !== 'update') return []
    if (!isVaultCollaborationRichTextBlockType(operation.blockType)) return []
    if (typeof operation.markdown !== 'string') return []
    if (operation.type === 'insert') {
      if (operation.afterId !== null && typeof operation.afterId !== 'string') return []
      return [
        {
          type: 'insert',
          id: operation.id,
          afterId: operation.afterId,
          blockType: operation.blockType,
          markdown: operation.markdown,
        },
      ]
    }
    return [
      {
        type: 'update',
        id: operation.id,
        blockType: operation.blockType,
        markdown: operation.markdown,
      },
    ]
  })
  return operations.length > 0 ? operations : undefined
}

function isVaultCollaborationRichTextMark(
  value: unknown,
): value is Extract<VaultCollaborationRichTextOperation, { type: 'mark' }>['mark'] {
  return (
    value === 'bold' ||
    value === 'italic' ||
    value === 'code' ||
    value === 'link' ||
    value === 'strike' ||
    value === 'underline' ||
    value === 'highlight' ||
    value === 'color'
  )
}

function isVaultCollaborationRichTextBlockType(value: unknown): value is VaultCollaborationRichTextBlockType {
  return (
    value === 'heading' ||
    value === 'paragraph' ||
    value === 'list' ||
    value === 'taskList' ||
    value === 'table' ||
    value === 'quote' ||
    value === 'code' ||
    value === 'horizontalRule'
  )
}

function parseVaultCollaborationCrdtCharacters(value: unknown): VaultCollaborationCrdtCharacter[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): VaultCollaborationCrdtCharacter[] => {
    if (!item || typeof item !== 'object') return []
    const character = item as Record<string, unknown>
    if (typeof character.id !== 'string') return []
    if (character.afterId !== null && typeof character.afterId !== 'string') return []
    if (typeof character.value !== 'string' || character.value.length === 0) return []
    const afterId: string | null = character.afterId === null ? null : (character.afterId as string)
    return [
      {
        id: character.id,
        afterId,
        value: character.value,
        deleted: character.deleted === true ? true : undefined,
      },
    ]
  })
}

export async function searchVaultNotes(query: string, includeTrashed = true): Promise<VaultNote[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const result = await api.get<any>(
    `${LOCAL_VAULT_PREFIX}/search?q=${encodeURIComponent(trimmed)}&include_trashed=${includeTrashed ? 'true' : 'false'}`,
  )
  const payload = result?.data || result || {}
  const rawNotes = Array.isArray(payload.notes) ? payload.notes : []
  const rawAttachments: Array<Record<string, unknown>> = Array.isArray(payload.attachments) ? payload.attachments : []
  const notes = rawNotes.map(docToNote).filter((note: VaultNote) => !isInternalDoc(note._id))
  for (const att of rawAttachments) {
    const attachment = attachmentRecordToNote(att)
    if (attachment) notes.push(attachment)
  }
  return notes
}

export async function getNoteComments(id: string): Promise<VaultComment[]> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/comments?id=${encodeURIComponent(id)}`)
  const payload = result?.data || result || {}
  return Array.isArray(payload.comments) ? payload.comments : []
}

export async function createNoteComment(
  id: string,
  body: string,
  anchor: Record<string, unknown> = {},
): Promise<VaultComment> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/comments`, {
    document_id: id,
    body,
    anchor_json: anchor,
  })
  const payload = result?.data || result || {}
  return payload.comment
}

export async function createNoteCommentReply(id: string, body: string): Promise<VaultCommentReply> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/comments/${encodeURIComponent(id)}/replies`, { body })
  const payload = result?.data || result || {}
  return payload.reply
}

export async function resolveNoteComment(id: string): Promise<void> {
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/comments/${encodeURIComponent(id)}/resolve`, {})
}

export async function getNoteSuggestions(id: string): Promise<VaultSuggestion[]> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/suggestions?id=${encodeURIComponent(id)}`)
  const payload = result?.data || result || {}
  return Array.isArray(payload.suggestions) ? payload.suggestions : []
}

export async function createNoteSuggestion(
  id: string,
  patch: Record<string, unknown>,
  body = '',
  anchor: Record<string, unknown> = {},
): Promise<VaultSuggestion> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/suggestions`, {
    document_id: id,
    body,
    anchor_json: anchor,
    patch_json: patch,
  })
  const payload = result?.data || result || {}
  return payload.suggestion
}

export async function applyNoteSuggestion(id: string): Promise<void> {
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/suggestions/${encodeURIComponent(id)}/apply`, {})
}

export async function rejectNoteSuggestion(id: string): Promise<void> {
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/suggestions/${encodeURIComponent(id)}/reject`, {})
}

export async function exportEncryptedVault(password: string): Promise<VaultEncryptedBackup> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/export/encrypted`, { password })
  const payload = result?.data || result || {}
  return payload.backup
}

export async function importEncryptedVault(
  password: string,
  backup: VaultEncryptedBackup | Record<string, unknown>,
): Promise<VaultImportStats> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/import/encrypted`, { password, backup })
  const payload = result?.data || result || {}
  hasFetchedFromBackend = false
  hasFetchedFoldersFromBackend = false
  notesCache.clear()
  metaCache.clear()
  foldersCache.clear()
  saveMetaCache(metaCache)
  saveFolderCache(foldersCache)
  return payload
}

export async function getNoteRevisions(id: string): Promise<VaultRevision[]> {
  const result = await api.get<any>(`${LOCAL_VAULT_PREFIX}/revisions?id=${encodeURIComponent(id)}`)
  const payload = result?.data || result || {}
  const revisions = Array.isArray(payload.revisions) ? payload.revisions : []
  return revisions
    .map((item: any) => ({
      rev: String(item.rev || ''),
      status: String(item.status || 'available'),
      version_number: typeof item.version_number === 'number' ? item.version_number : undefined,
      label: typeof item.label === 'string' ? item.label : null,
      created_at: typeof item.created_at === 'number' ? item.created_at : undefined,
      created_by: typeof item.created_by === 'string' ? item.created_by : undefined,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      checksum: typeof item.checksum === 'string' ? item.checksum : undefined,
    }))
    .filter((item: VaultRevision) => item.rev)
}

export async function getNoteRevision(id: string, rev: string): Promise<VaultRevisionDetail> {
  const result = await api.get<any>(
    `${LOCAL_VAULT_PREFIX}/revision?id=${encodeURIComponent(id)}&rev=${encodeURIComponent(rev)}`,
  )
  const payload = result?.data || result || {}
  return payload.revision
}

export async function createNoteVersionCheckpoint(id: string, label?: string): Promise<string> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/revisions/checkpoint`, { id, label })
  const payload = result?.data || result || {}
  return payload.rev
}

export async function labelNoteRevision(id: string, rev: string, label?: string): Promise<void> {
  await api.post<any>(`${LOCAL_VAULT_PREFIX}/revisions/label`, { id, rev, label })
}

export async function restoreNoteRevision(id: string, rev: string): Promise<VaultNote> {
  const result = await api.post<any>(`${LOCAL_VAULT_PREFIX}/restore`, { id, rev })
  const payload = result?.data || result || {}
  const current = notesCache.get(id)
  const restored = await api.get<any>(`${LOCAL_VAULT_PREFIX}/doc?id=${encodeURIComponent(id)}`)
  const doc = docToNote(restored?.data || restored || payload)
  const note = current ? { ...doc, title: doc.title || current.title } : doc
  notesCache.set(note._id, note)
  metaCache.set(note._id, toMeta(note))
  clearLocalDraft(note._id)
  saveMetaCache(metaCache)
  return note
}

export async function createNote(title: string, folder: string = '', content: string = ''): Promise<VaultNote> {
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
    const result = await api.put<any>(`${LOCAL_VAULT_PREFIX}/folder?path=${encodeURIComponent(normalized)}`, folder)
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

  try {
    await api.del(`${LOCAL_VAULT_PREFIX}/folder?path=${encodeURIComponent(normalized)}`)
  } catch (err) {
    console.warn('[vault] delete folder failed:', err)
    throw err
  }

  for (const folder of [...foldersCache.values()]) {
    if (folder.path === normalized || folder.path.startsWith(`${normalized}/`)) {
      foldersCache.delete(folder.path)
    }
  }
  saveFolderCache(foldersCache)
}

// --- Helpers ---

export function normalizeFolderPath(path: string): string {
  return path
    .split('/')
    .map(part => part.trim().replace(/[\\:*?"<>|]/g, ''))
    .filter(part => part && part !== '.' && part !== '..')
    .join('/')
}

function isTrashFolderPath(path: string): boolean {
  const normalized = normalizeFolderPath(path).toLowerCase()
  return normalized === 'trash' || normalized.startsWith('trash/')
}

function visibleTrashFolderPath(
  folder: string | null | undefined,
  trashedAt?: number | null,
  trashOriginPath?: string | null,
): string {
  const normalized = normalizeFolderPath(String(folder ?? ''))
  if (!trashedAt || isTrashFolderPath(normalized)) return normalized
  const origin = normalizeFolderPath(trashOriginPath || normalized)
  return origin ? `Trash/${origin}` : 'Trash'
}

function visibleFolderRecordPath(folder: Pick<VaultFolder, 'path' | 'trashed_at' | 'trash_origin_path'>): string {
  return visibleTrashFolderPath(folder.path, folder.trashed_at ?? null, folder.trash_origin_path ?? null)
}

function isInsideFolderPath(folder: string, path: string): boolean {
  return folder === path || folder.startsWith(`${path}/`)
}

function noteFolderPath(note: VaultNote): string {
  const folder = visibleTrashFolderPath(note.folder, note.trashed_at ?? null, note.trash_origin_path ?? null)
  if (folder) return folder
  const parts = note._id.split('/')
  parts.pop()
  return normalizeFolderPath(parts.join('/'))
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
    n =>
      normalizeComparableTitle(n.title) === lower ||
      normalizeComparableTitle(n._id.replace(/\.md$/, '').split('/').pop() || '') === lower ||
      n.aliases?.some(alias => normalizeComparableTitle(alias) === lower),
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

export function rewriteWikilinkPath(content: string, fromId: string, toId: string): string {
  const from = normalizeWikilinkPathTarget(fromId)
  const to = normalizeWikilinkPathTarget(toId)
  if (!from || !to || from === to) return content
  const fromParsed = parseWikilinkTarget(fromId)
  const toParsed = parseWikilinkTarget(toId)

  return content.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (match, rawTarget: string, aliasPart = '') => {
    const parsed = parseWikilinkTarget(rawTarget)
    const current = normalizeWikilinkPathTarget(`${parsed.prefix ? `${parsed.prefix}/` : ''}${parsed.basename}`)
    if (current !== from) return match
    const keepDisplayBasename =
      normalizeComparableTitle(parsed.basename) === normalizeComparableTitle(fromParsed.basename) &&
      normalizeComparableTitle(toParsed.basename) === normalizeComparableTitle(fromParsed.basename)
    const nextBasename = keepDisplayBasename ? parsed.basename : toParsed.basename
    const nextTarget = toParsed.prefix ? `${toParsed.prefix}/${nextBasename}` : nextBasename
    return `[[${nextTarget}${parsed.suffix}${aliasPart}]]`
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
    return raw.slice(1, -1).split(',').map(cleanYamlValue).filter(Boolean)
  }
  return cleanYamlValue(raw)
}

function cleanYamlValue(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

function frontmatterAliases(properties: Record<string, string | string[]>): string[] {
  const raw = properties.aliases ?? properties.alias
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]).map(alias => alias.trim()).filter(Boolean)
}

function frontmatterTags(properties: Record<string, string | string[]>): string[] {
  const raw = properties.tags ?? properties.tag
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap(value => value.split(/[,\s]+/))
    .map(tag => tag.replace(/^#/, '').trim())
    .filter(Boolean)
}

function normalizeWikilinkTarget(target: string): string {
  return parseWikilinkTarget(target).basename
}

function normalizeWikilinkPathTarget(target: string): string {
  const parsed = parseWikilinkTarget(target)
  return [...parsed.prefix.split('/'), parsed.basename]
    .filter(Boolean)
    .map(part => normalizeComparableTitle(part))
    .join('/')
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
  return normalizeWikilinkTarget(title).replace(/\.md$/i, '').trim().toLowerCase()
}
