import type { DockerContainerInfo, HomelabData, PortainerInstanceInfo } from './types'
import { SummaryCard } from './components'

export default function OverviewSection({
  data,
  portainerInstances,
  dockerContainers,
}: {
  data: HomelabData
  portainerInstances: PortainerInstanceInfo[]
  dockerContainers: DockerContainerInfo[]
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
      <SummaryCard
        title="Compute"
        rows={[
          ['Nodes', `${data.proxmox.nodes.filter(n => n.status === 'online').length}/${data.proxmox.nodes.length}`],
          [
            'Guests',
            `${data.proxmox.vms.filter(v => v.status === 'running').length}/${data.proxmox.vms.length} running`,
          ],
        ]}
      />
      <SummaryCard
        title="Docker / Portainer"
        rows={[
          ['Instances', `${portainerInstances.filter(i => i.available).length}/${portainerInstances.length} live`],
          [
            'Containers',
            `${dockerContainers.filter(container => container.state === 'running').length}/${dockerContainers.length} running`,
          ],
        ]}
      />
      <SummaryCard
        title="Network"
        rows={[
          ['Firewall', data.opnsense?.status ?? 'unknown'],
          ['WAN in', data.opnsense?.wan_in ?? '-'],
          ['WAN out', data.opnsense?.wan_out ?? '-'],
        ]}
      />
      <SummaryCard title="Systems" rows={(data.systems ?? []).map(system => [system.name, system.status])} />
    </div>
  )
}
