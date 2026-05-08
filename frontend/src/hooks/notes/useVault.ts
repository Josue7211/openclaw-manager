import { useState, useEffect, useCallback, useRef } from 'react'
import type { VaultFolder, VaultNote } from '@/pages/notes/types'
import {
  getAllNotes,
  getAllFolders,
  createNote as vaultCreate,
  createFolder as vaultCreateFolder,
  putNote,
  deleteFolder as vaultDeleteFolder,
  deleteNote as vaultDelete,
  startSync,
  stopSync,
} from '@/lib/vault'

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
    async (title: string, folder: string = '') => {
      const note = await vaultCreate(title, folder)
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
    deleteNote,
    deleteFolder,
  }
}
