import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import type { VaultNote } from '@/pages/notes/types'

const VAULT_NOTES_KEY = ['vault-notes'] as const

const DEMO_NOTES: Pick<VaultNote, '_id' | 'title' | 'folder' | 'updated_at'>[] = [
  { _id: 'demo-n1', title: 'Project Architecture', folder: 'engineering', updated_at: Date.now() - 300_000 },
  { _id: 'demo-n2', title: 'Weekly Standup Notes', folder: 'meetings', updated_at: Date.now() - 3_600_000 },
  { _id: 'demo-n3', title: 'Deployment Runbook', folder: 'ops', updated_at: Date.now() - 7_200_000 },
  { _id: 'demo-n4', title: 'API Design Decisions', folder: 'engineering', updated_at: Date.now() - 86_400_000 },
  { _id: 'demo-n5', title: 'Reading List', folder: '', updated_at: Date.now() - 172_800_000 },
]

export function useRecentNotes() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ notes?: VaultNote[] }>({
    queryKey: VAULT_NOTES_KEY,
    queryFn: () => api.get<{ notes?: VaultNote[] }>('/api/vault/notes'),
    enabled: !_demo,
  })

  const allNotes = _demo ? DEMO_NOTES : (data?.notes ?? [])

  const recentNotes = useMemo(() => {
    return [...allNotes]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 5)
  }, [allNotes])

  const totalCount = allNotes.length

  return { notes: allNotes, recentNotes, totalCount, mounted: _demo || isSuccess }
}
