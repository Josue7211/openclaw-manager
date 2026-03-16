


import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BackendErrorBanner } from '@/components/BackendErrorBanner'
import SecondsAgo from '@/components/SecondsAgo'
import { PageHeader } from '@/components/PageHeader'

import { api, ApiError } from '@/lib/api'
import { emit } from '@/lib/event-bus'
import { queryKeys } from '@/lib/query-keys'
import { useRealtimeSSE } from '@/lib/hooks/useRealtimeSSE'
import { useTodos } from '@/lib/hooks/useTodos'
import { isDemoMode, DEMO_TODOS, DEMO_MISSIONS, DEMO_CALENDAR_EVENTS, DEMO_PROXMOX_VMS, DEMO_PROXMOX_NODES, DEMO_OPNSENSE } from '@/lib/demo-data'
import type { Todo, Mission, CalendarEvent } from '@/lib/types'

import type { ProxmoxVM, ProxmoxNodeStat, OPNsenseData } from './personal/types'
import MorningBrief from './personal/MorningBrief'
import DailyReviewWidget from './personal/DailyReviewWidget'
import TodoSection from './personal/TodoSection'
import HomelabSection from './personal/HomelabSection'

export default function PersonalDashboard() {
  const queryClient = useQueryClient()
  const _demo = isDemoMode()
  const [proxmoxVMs, setProxmoxVMs] = useState<ProxmoxVM[]>(_demo ? DEMO_PROXMOX_VMS : [])
  const [proxmoxNodes, setProxmoxNodes] = useState<ProxmoxNodeStat[]>(_demo ? DEMO_PROXMOX_NODES : [])
  const [opnsense, setOpnsense] = useState<OPNsenseData | null>(_demo ? DEMO_OPNSENSE : null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [backendError, setBackendError] = useState<string | false>(false)
  const { addMutation, toggleMutation, deleteMutation, invalidateTodos } = useTodos()

  const { data: todosData, isSuccess: todosMounted } = useQuery<{ todos?: Todo[] }>({
    queryKey: queryKeys.todos,
    queryFn: () => api.get<{ todos?: Todo[] }>('/api/todos'),
    enabled: !_demo,
  })
  const todos = _demo ? DEMO_TODOS : (todosData?.todos ?? [])

  const { data: missionsData, isSuccess: missionsMounted } = useQuery<{ missions?: Mission[] }>({
    queryKey: queryKeys.missions,
    queryFn: () => api.get<{ missions?: Mission[] }>('/api/missions'),
    enabled: !_demo,
  })
  const missions = _demo ? DEMO_MISSIONS : (missionsData?.missions ?? [])

  const { data: calendarData, isSuccess: calendarMounted } = useQuery<{ events?: CalendarEvent[] }>({
    queryKey: queryKeys.calendar,
    queryFn: () => api.get<{ events?: CalendarEvent[] }>('/api/calendar'),
    enabled: !_demo,
  })
  const calendarEvents = _demo ? DEMO_CALENDAR_EVENTS : (calendarData?.events ?? [])

  const mounted = _demo || (todosMounted && missionsMounted && calendarMounted)

  const fetchHomelab = useCallback(async () => {
    if (_demo) return
    try {
      const d = await api.get<Record<string, unknown>>('/api/homelab')
      setBackendError(false)
      if (d.proxmox?.vms) {
        const toGB = (b: number) => +(b / 1073741824).toFixed(1)
        setProxmoxVMs(d.proxmox.vms.map((v: Record<string, unknown>) => ({
          vmid: 0, node: 'pve', name: v.name, status: v.status,
          cpuPercent: Math.round((v.cpu as number) * 100),
          memUsedGB: toGB(v.mem as number), memTotalGB: 0,
        })))
        if (d.proxmox.nodes) {
          setProxmoxNodes(d.proxmox.nodes.map((n: Record<string, unknown>) => ({
            node: n.name, cpuPercent: Math.round((n.cpu as number) * 100),
            memUsedGB: toGB(n.mem_used as number), memTotalGB: toGB(n.mem_total as number),
            memPercent: Math.round(((n.mem_used as number) / (n.mem_total as number)) * 100),
          })))
        }
      }
      if (d.opnsense) {
        setOpnsense({
          wanIn: d.opnsense.wan_in ?? '—', wanOut: d.opnsense.wan_out ?? '—',
          updateAvailable: false, version: '—',
        })
      }
    } catch (e) {
      setBackendError(e instanceof ApiError ? e.serviceLabel : 'Service unavailable')
    }
  }, [])

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.todos })
    queryClient.invalidateQueries({ queryKey: queryKeys.missions })
    queryClient.invalidateQueries({ queryKey: queryKeys.calendar })
    fetchHomelab()
    setLastRefresh(new Date())
  }, [queryClient, fetchHomelab])

  useEffect(() => {
    fetchHomelab()
    const homelabInterval = setInterval(fetchHomelab, 10000)
    return () => clearInterval(homelabInterval)
  }, [fetchHomelab])

  // Real-time subscriptions via SSE
  useRealtimeSSE(['todos', 'cache'], {
    onEvent: (table) => {
      if (table === 'todos') {
        invalidateTodos()
        emit('todo-changed', null, 'supabase')
      }
      if (table === 'cache') {
        fetchHomelab()
      }
    },
  })

  const addTodo = async (text: string) => {
    await addMutation.mutateAsync(text)
  }
  const toggleTodo = async (id: string, done: boolean) => {
    await toggleMutation.mutateAsync({ id, done })
  }
  const deleteTodo = async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }

  return (
    <div>
      {backendError && <BackendErrorBanner label={backendError} />}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <PageHeader defaultTitle="Personal Dashboard" defaultSubtitle="home · todos · infra" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            refreshed <SecondsAgo sinceMs={lastRefresh.getTime()} />
          </span>
          <button
            onClick={refreshAll}
            style={{
              background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px',
              color: 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', transition: 'all 0.25s var(--ease-spring)',
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Morning Brief */}
      <MorningBrief todos={todos} missions={missions} calendarEvents={calendarEvents} mounted={mounted} />

      {/* Daily Review Widget */}
      <DailyReviewWidget todos={todos} missions={missions} />

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <TodoSection
          todos={todos}
          mounted={mounted}
          isDemo={_demo}
          onAdd={addTodo}
          onToggle={toggleTodo}
          onDelete={deleteTodo}
        />
        <HomelabSection
          proxmoxVMs={proxmoxVMs}
          proxmoxNodes={proxmoxNodes}
          opnsense={opnsense}
          mounted={mounted}
        />
      </div>
    </div>
  )
}
