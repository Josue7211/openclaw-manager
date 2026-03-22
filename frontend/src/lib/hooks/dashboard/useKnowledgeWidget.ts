import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode } from '@/lib/demo-data'
import type { KnowledgeEntry } from '@/pages/knowledge/shared'

const DEMO_ENTRIES: KnowledgeEntry[] = [
  { id: '1', title: 'React Server Components deep dive', tags: ['react', 'rsc'], created_at: '2026-03-22T10:00:00Z', updated_at: '2026-03-22T10:00:00Z' },
  { id: '2', title: 'Tailscale ACL best practices', tags: ['networking', 'security'], created_at: '2026-03-21T14:30:00Z', updated_at: '2026-03-21T14:30:00Z' },
  { id: '3', title: 'AES-256-GCM vs ChaCha20-Poly1305', tags: ['crypto'], created_at: '2026-03-20T09:00:00Z', updated_at: '2026-03-20T09:00:00Z' },
  { id: '4', title: 'Tauri v2 migration notes', tags: ['tauri', 'rust'], created_at: '2026-03-19T16:00:00Z', updated_at: '2026-03-19T16:00:00Z' },
  { id: '5', title: 'PostgreSQL row-level security patterns', tags: ['postgres', 'security'], created_at: '2026-03-18T11:00:00Z', updated_at: '2026-03-18T11:00:00Z' },
]

export function useKnowledgeWidget() {
  const _demo = isDemoMode()

  const { data: entriesData } = useQuery({
    queryKey: queryKeys.knowledge,
    queryFn: () => api.get<{ entries?: KnowledgeEntry[] }>('/api/knowledge').then(d => d.entries || []),
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const entries = _demo ? DEMO_ENTRIES : (entriesData ?? [])

  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [entries])

  const totalCount = entries.length

  return { entries, recentEntries, totalCount, mounted: true }
}
