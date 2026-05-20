import type { HomelabAuditEntry, HomelabConfigData, HomelabData } from './types'
import { ResourceList, SectionHeader, SummaryCard, card } from './components'

export default function ActivitySettingsSection({
  data,
  configInfo,
  syncStatusText,
  auditEntries,
}: {
  data: HomelabData
  configInfo: HomelabConfigData | null
  syncStatusText: string
  auditEntries: HomelabAuditEntry[]
}) {
  const tasks = (data.proxmox.tasks ?? []).slice(0, 10)
  const diagnostics = data.diagnostics?.providers ?? []
  const providers = [
    ['Proxmox', data.live?.proxmox ? 'live' : 'offline'],
    ['OPNsense', data.live?.opnsense ? 'live' : 'offline'],
    ['Portainer', data.live?.portainer ? 'live' : 'offline'],
    ['Docker source', data.live?.portainer ? 'Portainer live' : 'Portainer offline'],
    ['Sync', syncStatusText],
  ] as Array<[string, string]>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <SectionHeader title="Provider Settings" meta={configInfo ? 'configured locally' : 'not loaded'} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <SummaryCard title="Provider Health" rows={providers} />
          <SummaryCard
            title="Configured Secrets"
            rows={[
              ['Proxmox', configInfo?.api_configured.proxmox ? 'configured' : 'missing'],
              ['OPNsense', configInfo?.api_configured.opnsense ? 'configured' : 'missing'],
              ['Portainer', configInfo?.api_configured.portainer ? 'configured' : 'missing'],
            ]}
          />
          <SummaryCard
            title="Control Guardrails"
            rows={[
              ['Mutations', 'backend only'],
              ['Dangerous actions', 'typed confirmation'],
              ['Docker source', 'portainer'],
            ]}
          />
        </div>
      </div>
      <div style={card}>
        <SectionHeader title="Provider Diagnostics" meta={`${diagnostics.length} findings`} />
        <ResourceList
          empty="No provider diagnostics"
          rows={diagnostics.map(item => ({
            id: item.provider,
            name: item.provider,
            meta: item.message,
            status: item.severity === 'error' ? 'offline' : item.severity === 'warn' ? 'unknown' : 'online',
            actions: (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                {item.status}
              </span>
            ),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader
          title="Recent Control Audit"
          meta={`${auditEntries.length} actions`}
        />
        <ResourceList
          empty="No HomeLab control actions audited yet"
          rows={auditEntries.map(entry => {
            const details = entry.details ?? {}
            const provider = details.provider ?? 'homelab'
            const action = details.action ?? entry.action
            const target = details.target_name ?? details.resource_id ?? entry.resource_id ?? 'resource'
            const context = [
              provider,
              details.resource_type ?? entry.resource_type,
              details.node ? `node ${details.node}` : null,
              details.endpoint_id ? `endpoint ${details.endpoint_id}` : null,
              entry.created_at ? new Date(entry.created_at).toLocaleString() : null,
            ]
              .filter(Boolean)
              .join(' · ')
            return {
              id: String(entry.id),
              name: `${action} ${target}`,
              meta: context,
              status: details.destructive ? 'offline' : 'online',
              actions: (
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                  {details.confirmation_supplied ? 'confirmed' : 'recorded'}
                </span>
              ),
            }
          })}
        />
      </div>
      <div style={card}>
        <SectionHeader
          title="Recent Provider Tasks"
          meta={`${tasks.length}/${data.proxmox.tasks?.length ?? 0} shown`}
        />
        <ResourceList
          empty="No recent tasks reported"
          rows={tasks.map(task => ({
            id: task.upid || `${task.node}:${task.id}:${task.starttime}`,
            name: task.task_type || task.id || 'task',
            meta: `${task.node} · ${task.user || 'user'} · ${task.id || 'resource'} · ${task.starttime ? new Date(task.starttime * 1000).toLocaleString() : 'time unknown'}`,
            status:
              task.status === 'OK' ? 'online' : task.status.toLowerCase().includes('error') ? 'offline' : 'unknown',
            actions: (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                {task.status}
              </span>
            ),
          }))}
        />
      </div>
    </div>
  )
}
