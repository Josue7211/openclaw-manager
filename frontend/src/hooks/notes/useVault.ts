import { useState, useEffect, useCallback, useRef } from 'react'
import type { VaultFolder, VaultNote } from '@/features/notes/types'
import {
  getAllNotes,
  getAllFolders,
  createNote as vaultCreate,
  createFolder as vaultCreateFolder,
  putNote,
  moveNote as vaultMoveNote,
  deleteFolder as vaultDeleteFolder,
  deleteNote as vaultDelete,
  emptyTrash as vaultEmptyTrash,
  trashNote as vaultTrash,
  trashFolder as vaultTrashFolder,
  restoreTrashedNote as vaultRestoreTrashed,
  restoreTrashedFolder as vaultRestoreTrashedFolder,
  isCachedTitleOnlyNote,
  startSync,
  stopSync,
} from '@/lib/vault'
import { isNotesTrashPath, normalizeNotesFolderPath } from '@/features/notes/trash'

const TITLE_ONLY_CACHE_MESSAGE =
  'Only cached note titles are available right now. Connect the local vault and retry before editing so blank cache records do not overwrite real note bodies.'
const FOLDER_LOAD_ERROR_MESSAGE =
  'Notes loaded, but folders are temporarily unavailable. Retry sync to restore the folder tree.'
const TITLE_ONLY_RETRY_BASE_MS = 1_500
const TITLE_ONLY_RETRY_MAX_MS = 8_000

function hasCachedTitleOnlyNotes(notes: VaultNote[]) {
  return notes.some(isCachedTitleOnlyNote)
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Failed to load vault'
}

export function useVault() {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [unavailableNotes, setUnavailableNotes] = useState<VaultNote[]>([])
  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const [notesResult, foldersResult] = await Promise.allSettled([getAllNotes({ force: true }), getAllFolders()])
      if (notesResult.status === 'rejected') throw notesResult.reason
      let all = notesResult.value
      const allFolders = foldersResult.status === 'fulfilled' ? foldersResult.value : null
      if (hasCachedTitleOnlyNotes(all)) {
        all = await getAllNotes({ force: true })
      }
      const hasUnhydratedNotes = hasCachedTitleOnlyNotes(all)
      const editableNotes = all.filter(note => !isCachedTitleOnlyNote(note))
      const titleOnlyNotes = all.filter(isCachedTitleOnlyNote)
      if (mountedRef.current) {
        setNotes(editableNotes)
        setUnavailableNotes(titleOnlyNotes)
        if (allFolders) setFolders(allFolders)
        if (foldersResult.status === 'rejected') {
          console.warn('[useVault] folders refresh failed:', foldersResult.reason)
        }
        setError(
          hasUnhydratedNotes
            ? TITLE_ONLY_CACHE_MESSAGE
            : foldersResult.status === 'rejected'
              ? FOLDER_LOAD_ERROR_MESSAGE
              : null,
        )
      }
    } catch (err) {
      console.error('[useVault] refresh failed:', err)
      if (mountedRef.current) {
        setError(errorMessage(err))
      }
    }
  }, [])

  // Initial load + sync
  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    async function init() {
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)

      startSync(() => {
        if (!cancelled) {
          setSyncing(true)
          refresh().then(() => setSyncing(false))
        }
      })
    }

    init()

    return () => {
      cancelled = true
      mountedRef.current = false
      stopSync()
    }
  }, [refresh])

  useEffect(() => {
    if (loading || unavailableNotes.length === 0) return

    let cancelled = false
    let retryCount = 0
    let retryTimer: number | null = null

    const scheduleRetry = () => {
      const delay = Math.min(
        TITLE_ONLY_RETRY_BASE_MS * 2 ** retryCount,
        TITLE_ONLY_RETRY_MAX_MS,
      )
      retryCount += 1
      retryTimer = window.setTimeout(() => {
        void refresh().finally(() => {
          if (!cancelled) scheduleRetry()
        })
      }, delay)
    }

    scheduleRetry()

    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [loading, refresh, unavailableNotes.length])

  const createNote = useCallback(
    async (title: string, folder: string = '', content: string = '') => {
      const note = await vaultCreate(title, folder, content)
      await refresh()
      return note
    },
    [refresh],
  )

  const createFolder = useCallback(
    async (path: string) => {
      const folder = await vaultCreateFolder(path)
      await refresh()
      return folder
    },
    [refresh],
  )

  const updateNote = useCallback(
    async (note: VaultNote) => {
      const updated = await putNote(note)
      // Optimistic local update
      setNotes((prev) =>
        prev.map((n) => (n._id === updated._id ? updated : n)),
      )
      return updated
    },
    [],
  )

  const deleteNote = useCallback(
    async (id: string) => {
      await vaultDelete(id)
      setNotes((prev) => prev.filter((n) => n._id !== id))
    },
    [],
  )

  const trashNote = useCallback(
    async (id: string) => {
      const now = Date.now()
      setNotes((prev) =>
        prev.map((note) => {
          if (note._id !== id) return note
          const folder = normalizeNotesFolderPath(note.folder)
          const origin = isNotesTrashPath(folder)
            ? folder.split('/').slice(1).join('/')
            : folder
          return {
            ...note,
            folder: origin ? `Trash/${origin}` : 'Trash',
            trash_origin_path: note.trash_origin_path ?? origin,
            trashed_at: note.trashed_at ?? now,
            updated_at: now,
          }
        }),
      )
      await vaultTrash(id)
      await refresh()
    },
    [refresh],
  )

  const restoreTrashedNote = useCallback(
    async (id: string, folder?: string) => {
      const restored = await vaultRestoreTrashed(id, folder)
      await refresh()
      return restored
    },
    [refresh],
  )

  const emptyTrash = useCallback(
    async () => {
      const deleted = await vaultEmptyTrash()
      await refresh()
      return deleted
    },
    [refresh],
  )

  const trashFolder = useCallback(
    async (path: string) => {
      await vaultTrashFolder(path)
      await refresh()
    },
    [refresh],
  )

  const restoreTrashedFolder = useCallback(
    async (path: string) => {
      await vaultRestoreTrashedFolder(path)
      await refresh()
    },
    [refresh],
  )

  const moveNote = useCallback(
    async (id: string, folder: string = '') => {
      const moved = await vaultMoveNote(id, folder)
      await refresh()
      return moved
    },
    [refresh],
  )

  const deleteFolder = useCallback(
    async (path: string) => {
      await vaultDeleteFolder(path)
      setFolders((prev) => prev.filter((folder) => folder.path !== path))
    },
    [],
  )

  return {
    notes,
    unavailableNotes,
    folders,
    loading,
    syncing,
    error,
    refresh,
    createNote,
    createFolder,
    updateNote,
    moveNote,
    deleteNote,
    trashNote,
    trashFolder,
    restoreTrashedNote,
    restoreTrashedFolder,
    emptyTrash,
    deleteFolder,
  }
}
