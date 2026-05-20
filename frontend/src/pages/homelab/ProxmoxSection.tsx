import type { ReactNode } from 'react'

import type {
  HomelabData,
  NodeInfo,
  ProxmoxBackupInfo,
  ProxmoxHaResourceInfo,
  ProxmoxServiceInfo,
  ProxmoxStorageInfo,
  ProxmoxTaskInfo,
  VMInfo,
} from './types'
import { formatBytes, formatUptime, matchesQuery, normalizeFilter, proxmoxGuestMeta } from './helpers'
import { CpuBar, MemBar, ResourceList, SectionHeader, card, label } from './components'

export default function ProxmoxSection({
  data,
  filter,
  vmActions,
  nodeActions,
  serviceActions,
  storageActions,
  haActions,
  backupActions,
  taskActions,
}: {
  data: HomelabData
  filter: string
  vmActions: (vm: VMInfo) => ReactNode
  nodeActions: (node: NodeInfo) => ReactNode
  serviceActions: (service: ProxmoxServiceInfo) => ReactNode
  storageActions: (storage: ProxmoxStorageInfo) => ReactNode
  haActions: (resource: ProxmoxHaResourceInfo) => ReactNode
  backupActions: (backup: ProxmoxBackupInfo) => ReactNode
  taskActions: (task: ProxmoxTaskInfo) => ReactNode
}) {
  const query = normalizeFilter(filter)
  const guests = data.proxmox.vms.filter(vm =>
    matchesQuery(query, vm.name, vm.status, vm.node, vm.kind, String(vm.vmid ?? '')),
  )
  const storage = (data.proxmox.storage ?? []).filter(item =>
    matchesQuery(query, item.name, item.node, item.storage_type, item.content),
  )
  const backups = (data.proxmox.backups ?? []).filter(item =>
    matchesQuery(query, item.name, item.volid, item.node, item.storage, item.kind, String(item.vmid ?? '')),
  )
  const tasks = (data.proxmox.tasks ?? [])
    .filter(task => matchesQuery(query, task.task_type, task.status, task.node, task.user, task.id))
    .slice(0, 12)
  const services = (data.proxmox.services ?? []).filter(service =>
    matchesQuery(query, service.name, service.id, service.node, service.description, service.state),
  )
  const haResources = (data.proxmox.ha_resources ?? []).filter(item =>
    matchesQuery(query, item.sid, item.resource_type, item.state, item.group, item.comment),
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <SectionHeader title="Proxmox Nodes" meta={`${data.proxmox.nodes.length} total`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
          {data.proxmox.nodes.map(node => (
            <div key={node.name} style={{ ...card, background: 'var(--bg-elevated)' }}>
              <SectionHeader title={node.name} meta={node.status} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={label}>CPU</div>
                  <CpuBar value={node.cpu} />
                </div>
                <div>
                  <div style={label}>Memory</div>
                  <MemBar used={node.mem_used} total={node.mem_total} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  uptime {formatUptime(node.uptime)}
                </div>
                {nodeActions(node)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={card}>
        <SectionHeader
          title="Proxmox Storage"
          meta={`${storage.filter(item => item.active).length}/${storage.length} active`}
        />
        <ResourceList
          empty="No storage reported"
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
        <SectionHeader title="Backup Archives" meta={`${backups.length} restore points`} />
        <ResourceList
          empty="No Proxmox backups reported"
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
          title="VMs and LXCs"
          meta={`${guests.filter(v => v.status === 'running').length}/${guests.length} running`}
        />
        <ResourceList
          empty="No guests reported"
          rows={guests.map(vm => ({
            id: String(vm.vmid ?? vm.name),
            name: vm.name,
            meta: proxmoxGuestMeta(vm),
            status: vm.status,
            actions: vmActions(vm),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader title="Proxmox HA" meta={`${haResources.length} resources`} />
        <ResourceList
          empty="No HA resources reported"
          rows={haResources.map(item => ({
            id: item.sid,
            name: item.sid,
            meta: `${item.resource_type || 'resource'} · ${item.group || 'no group'} · ${item.comment || 'no comment'}`,
            status: item.state === 'started' || item.state === 'enabled' ? 'online' : item.state,
            actions: haActions(item),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader
          title="Proxmox Services"
          meta={`${services.filter(service => service.state === 'running').length}/${services.length} running`}
        />
        <ResourceList
          empty="No services reported"
          rows={services.map(service => ({
            id: `${service.node}:${service.id}`,
            name: service.name || service.id,
            meta: `${service.node} · ${service.description || service.id}`,
            status: service.state === 'running' ? 'online' : service.state === 'stopped' ? 'offline' : 'unknown',
            actions: serviceActions(service),
          }))}
        />
      </div>
      <div style={card}>
        <SectionHeader title="Recent Proxmox Tasks" meta={`${tasks.length}/${data.proxmox.tasks?.length ?? 0} shown`} />
        <ResourceList
          empty="No recent tasks reported"
          rows={tasks.map(task => ({
            id: task.upid || `${task.node}:${task.id}:${task.starttime}`,
            name: task.task_type || task.id || 'task',
            meta: `${task.node} · ${task.user || 'user'} · ${task.id || 'resource'} · ${task.starttime ? new Date(task.starttime * 1000).toLocaleString() : 'time unknown'}`,
            status:
              task.status === 'OK' ? 'online' : task.status.toLowerCase().includes('error') ? 'offline' : 'unknown',
            actions: taskActions(task),
          }))}
        />
      </div>
    </div>
  )
}
