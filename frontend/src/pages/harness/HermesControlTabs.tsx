import { useQuery } from '@tanstack/react-query'
import type React from 'react'

import { api } from '@/lib/api'
import { hermesControl } from '@/lib/hermes-control'

const wrap: React.CSSProperties = {
  height: '100%',
  overflow: 'auto',
  padding: 20,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const panel: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-elevated)',
  padding: 14,
}

const muted: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
}

const mono: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
  fontSize: 12,
  overflowWrap: 'anywhere',
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre style={{
      margin: 0,
      whiteSpace: 'pre-wrap',
      fontSize: 11,
      lineHeight: 1.5,
      color: 'var(--text-secondary)',
      fontFamily: 'monospace',
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export function HermesOverviewTab() {
  const status = useQuery({ queryKey: ['hermes-control', 'status'], queryFn: hermesControl.status, refetchInterval: 10000 })
  const infra = useQuery({ queryKey: ['hermes-control', 'infra'], queryFn: hermesControl.infra })
  return (
    <div style={wrap}>
      <div style={grid}>
        <div style={panel}>
          <div style={muted}>Version</div>
          <div style={mono}>{status.data?.version ?? '--'}</div>
        </div>
        <div style={panel}>
          <div style={muted}>Gateway</div>
          <div style={mono}>{status.data?.gateway_state ?? 'unknown'} / {status.data?.gateway_running ? 'running' : 'not running'}</div>
        </div>
        <div style={panel}>
          <div style={muted}>Active sessions</div>
          <div style={mono}>{status.data?.active_sessions ?? '--'}</div>
        </div>
        <div style={panel}>
          <div style={muted}>Platforms</div>
          <div style={mono}>{Object.keys(status.data?.gateway_platforms ?? {}).join(', ') || 'none active'}</div>
        </div>
      </div>
      <div style={{ ...grid, marginTop: 12 }}>
        {(infra.data?.nodes ?? []).map(node => (
          <div key={node.id} style={panel}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{node.label}</div>
            <div style={mono}>{node.url}</div>
            <div style={{ ...muted, marginTop: 8 }}>{node.peer_hostname ?? 'no Tailscale peer match'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HermesSessionsTab() {
  const sessions = useQuery({ queryKey: ['hermes-control', 'sessions'], queryFn: () => fetchSessions(), refetchInterval: 10000 })
  const items = Array.isArray(sessions.data?.sessions) ? sessions.data.sessions : []
  return (
    <div style={wrap}>
      {sessions.isLoading && <div style={muted}>Loading sessions...</div>}
      {!sessions.isLoading && items.length === 0 && <div style={muted}>No Hermes dashboard sessions reported.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((raw, index) => {
          const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : { value: raw }
          return (
          <div key={String(item.id ?? item.session_id ?? index)} style={panel}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{String(item.title ?? item.name ?? item.id ?? item.session_id ?? 'session')}</div>
            <JsonBlock value={item} />
          </div>
          )
        })}
      </div>
    </div>
  )
}

async function fetchSessions(): Promise<{ sessions?: unknown[] }> {
  return api.get('/api/hermes/control/sessions')
}

export function HermesLogsTab() {
  const logs = useQuery({ queryKey: ['hermes-control', 'logs'], queryFn: () => fetchLogs(), refetchInterval: 5000 })
  return (
    <div style={wrap}>
      <div style={panel}>
        {logs.isLoading ? <div style={muted}>Loading logs...</div> : <JsonBlock value={logs.data ?? []} />}
      </div>
    </div>
  )
}

async function fetchLogs(): Promise<unknown> {
  return api.get('/api/hermes/control/logs?limit=200')
}

export function HermesPlatformsTab() {
  const discord = useQuery({ queryKey: ['hermes-control', 'discord'], queryFn: hermesControl.discordDiscover })
  const bluebubbles = useQuery({ queryKey: ['hermes-control', 'bluebubbles'], queryFn: hermesControl.bluebubblesDiscover })
  const matrix = useQuery({ queryKey: ['hermes-control', 'matrix'], queryFn: hermesControl.matrixAudit })
  return (
    <div style={wrap}>
      <div style={grid}>
        <div style={panel}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Discord</div>
          <div style={muted}>Local AI Club</div>
          <JsonBlock value={discord.data ?? { status: 'loading' }} />
        </div>
        <div style={panel}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>BlueBubbles</div>
          <div style={muted}>Existing Mac/iMessage bridge</div>
          <JsonBlock value={bluebubbles.data ?? { status: 'loading' }} />
        </div>
        <div style={panel}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Matrix</div>
          <div style={muted}>Retired</div>
          <JsonBlock value={matrix.data ?? { status: 'loading' }} />
        </div>
      </div>
    </div>
  )
}
