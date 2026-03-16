import { useState, useEffect, useCallback, useRef } from 'react'
import type { VaultNote } from '@/pages/notes/types'
import {
  getAllNotes,
  createNote as vaultCreate,
  putNote,
  deleteNote as vaultDelete,
  startSync,
  stopSync,
} from '@/lib/vault'

export function useVault() {
  const [notes, setNotes] = useState<VaultNote[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const all = await getAllNotes()
      if (mountedRef.current) setNotes(all)
    } catch (err) {
      console.error('[useVault] refresh failed:', err)
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

  return {
    notes,
    loading,
    syncing,
    refresh,
    createNote,
    updateNote,
    deleteNote,
  }
}
