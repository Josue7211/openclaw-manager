import { useState, useCallback } from 'react'
import { Target, RefreshCw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { PageHeader } from '@/components/PageHeader'
import { isDemoMode, DEMO_MISSIONS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'
import type { Mission, Agent, Tab } from './missions/types'
import { MissionFilters } from './missions/MissionFilters'
import { MissionCard } from './missions/MissionCard'

export default function MissionsPage() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()
  const [tab, setTab]           = useState<Tab>('all')
  const [expandedId, setExpandedId]     = useState<string | null>(null)

  const { data: missionsData, isLoading: missionsLoading, error: missionsError } = useQuery<{ missions?: Mission[] }>({
    queryKey: queryKeys.missions,
    queryFn: () => api.get<{ missions?: Mission[] }>('/api/missions'),
    enabled: !_demo,
  })
  const missions = _demo
    ? (DEMO_MISSIONS as Mission[])
    : (missionsData?.missions ?? [])

  const { data: agentsData } = useQuery<{ agents?: Agent[] }>({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<{ agents?: Agent[] }>('/api/agents'),
    enabled: !_demo,
  })
  const agents = agentsData?.agents ?? []

  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]))

  const loading = _demo ? false : missionsLoading
  const error = missionsError ? (missionsError instanceof Error ? missionsError.message : 'Unknown error') : null

  const invalidateMissions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.missions })
  }, [queryClient])

  const markDoneMutation = useMutation({
    mutationFn: async (missionId: string) => {
      await api.patch('/api/missions', { id: missionId, status: 'done', progress: 100 })
    },
    onMutate: async (missionId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.missions })
      const prev = queryClient.getQueryData(queryKeys.missions)
      queryClient.setQueryData(queryKeys.missions, (old: { missions?: Mission[] } | undefined) => ({
        ...old,
        missions: (old?.missions || []).map(m =>
          m.id === missionId ? { ...m, status: 'done', progress: 100 } : m
        ),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.missions, ctx.prev)
    },
    onSettled: () => invalidateMissions(),
  })

  const handleMarkDone = useCallback((missionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    markDoneMutation.mutate(missionId)
  }, [markDoneMutation])

  const handleToggleExpand = useCallback((missionId: string) => {
    setExpandedId(prev => prev === missionId ? null : missionId)
  }, [])

  const markingDone = markDoneMutation.isPending ? markDoneMutation.variables : null

  const refreshMissions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    queryClient.invalidateQueries({ queryKey: queryKeys.agents })
  }, [queryClient])

  const filtered = missions.filter(m => {
    if (tab === 'all') return true
    if (tab === 'review') return m.status === 'awaiting_review'
    return m.status === tab
  })

  const counts: Record<Tab, number> = {
    all:     missions.length,
    active:  missions.filter(m => m.status === 'active').length,
    pending: missions.filter(m => m.status === 'pending').length,
    review:  missions.filter(m => m.status === 'awaiting_review').length,
    done:    missions.filter(m => m.status === 'done').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PageHeader defaultTitle="Missions" />
            {_demo && <DemoBadge />}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '3px' }}>
            {missions.length} total · {counts.active} active · {counts.done} done
          </div>
        </div>
        <button
          onClick={refreshMissions}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--hover-bg)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '7px 12px',
            color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
            transition: 'all 0.25s var(--ease-spring)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <MissionFilters tab={tab} counts={counts} onTabChange={setTab} />

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                height: '68px', borderRadius: '10px',
                background: 'linear-gradient(90deg, var(--hover-bg) 25%, var(--bg-card) 50%, var(--hover-bg) 75%)',
                backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ) : error ? (
          <div style={{
            padding: '20px', borderRadius: '10px',
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            color: 'var(--red-500)', fontSize: '13px', fontFamily: 'monospace',
          }}>
            Error: {error}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: '80px', gap: '12px', color: 'var(--text-muted)' }}>
            <Target size={40} strokeWidth={1} />
            <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {tab === 'all' ? 'No missions yet' : `No ${tab} missions`}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(mission => (
              <MissionCard
                key={mission.id}
                mission={mission}
                assigneeAgent={agentMap[mission.assignee]}
                isExpanded={expandedId === mission.id}
                isMarkingDone={markingDone === mission.id}
                onToggleExpand={handleToggleExpand}
                onMarkDone={handleMarkDone}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
