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
  startSync,
  stopSync,
} from '@/lib/vault'
import { isNotesTrashPath, normalizeNotesFolderPath } from '@/features/notes/trash'

export function useVault() {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const [all, allFolders] = await Promise.all([getAllNotes(), getAllFolders()])
      if (mountedRef.current) {
        setNotes(all)
        setFolders(allFolders)
        setError(null)
      }
    } catch (err) {
      console.error('[useVault] refresh failed:', err)
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load vault')
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
