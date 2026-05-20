import type { ReactNode } from 'react'

import type { HomelabData, HomelabSystemInfo, ProxmoxBackupInfo, ProxmoxStorageInfo } from './types'
import { formatBytes, matchesQuery, normalizeFilter } from './helpers'
import { ResourceList, SectionHeader, card } from './components'

export default function StorageBackupsSection({
  data,
  filter,
  systems,
  storageActions,
  backupActions,
  systemActions,
}: {
  data: HomelabData
  filter: string
  systems: HomelabSystemInfo[]
  storageActions: (storage: ProxmoxStorageInfo) => ReactNode
  backupActions: (backup: ProxmoxBackupInfo) => ReactNode
  systemActions: (system: HomelabSystemInfo) => ReactNode
}) {
  const query = normalizeFilter(filter)
  const storage = (data.proxmox.storage ?? []).filter(item =>
    matchesQuery(query, item.name, item.node, item.storage_type, item.content),
  )
  const backups = (data.proxmox.backups ?? []).filter(item =>
    matchesQuery(query, item.name, item.volid, item.node, item.storage, item.kind, String(item.vmid ?? '')),
  )
  const visibleSystems = systems.filter(system => {
    const haystack = `${system.id} ${system.name} ${system.status} ${system.actions.join(' ')}`.toLowerCase()
    const belongs = ['storage', 'backup', 'nas', 'share', 'snapshot', 'restore'].some(needle =>
      haystack.includes(needle),
    )
    return belongs && matchesQuery(query, system.name, system.status, system.actions.join(' '))
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <SectionHeader
          title="Storage Pools"
          meta={`${storage.filter(item => item.active).length}/${storage.length} active`}
        />
        <ResourceList
          empty="No Proxmox storage reported"
          rows={storage.map(item => ({
            id: `${item.node}:${item.name}`,
            name: `${item.name} (${item.node})`,
            meta: `${item.storage_type || 'storage'} · ${item.content || 'content'} · ${formatBytes(item.used)} / ${formatBytes(item.total)} · ${item.shared ? 'shared' : 'local'}`,
            status: item.active ? 'online' : item.enabled ? 'unknown' : 'offline',
            actions: storageActions(item),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader title="Restore Points" meta={`${backups.length} backups`} />
        <ResourceList
          empty="No restore points reported"
          rows={backups.map(backup => ({
            id: backup.volid,
            name: backup.name,
            meta: `${backup.node} · ${backup.storage} · ${backup.kind}${backup.vmid ? `/${backup.vmid}` : ''} · ${formatBytes(backup.size)} · ${
              backup.ctime ? new Date(backup.ctime * 1000).toLocaleString() : 'time unknown'
            }${backup.protected ? ' · protected' : ''}`,
            status: backup.protected ? 'protected' : 'backup',
            actions: backupActions(backup),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader
          title="NAS and Backup Systems"
          meta={`${visibleSystems.filter(s => s.status === 'configured').length}/${visibleSystems.length} configured`}
        />
        <ResourceList
          empty="No storage systems reported"
          rows={visibleSystems.map(system => ({
            id: system.id,
            name: system.name,
            meta:
              system.primary_url ??
              (system.actions.length ? system.actions.join(', ') : 'configure credentials to enable controls'),
            status: system.status,
            actions: systemActions(system),
          }))}
        />
      </div>
    </div>
  )
}
