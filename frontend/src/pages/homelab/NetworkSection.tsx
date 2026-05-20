import type { ReactNode } from 'react'

import type { HomelabData, OPNsenseServiceInfo } from './types'
import { formatBytes, formatUptime, rowValue } from './helpers'
import { ResourceList, SectionHeader, SummaryCard, card } from './components'

export default function NetworkSection({
  data,
  opnsenseServiceActions,
}: {
  data: HomelabData
  opnsenseServiceActions: (service: OPNsenseServiceInfo) => ReactNode
}) {
  const opn = data.opnsense
  const services = opn?.services ?? []
  const interfaces = opn?.interfaces ?? []
  const gateways = opn?.gateways ?? []
  const dhcpLeaseCount = opn?.dhcp?.total ?? opn?.dhcp?.leases?.length ?? 0
  const dnsStatus = opn?.dns?.unbound_status ?? 'unknown'
  const firewallRules = opn?.firewall?.rule_total ?? opn?.firewall?.rules?.length ?? 0
  const firewallAliases = opn?.firewall?.alias_total ?? opn?.firewall?.aliases?.length ?? 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <SectionHeader title="OPNsense Network" meta={opn?.status ?? 'unknown'} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <SummaryCard
            title="WAN"
            rows={[
              ['Inbound', opn?.wan_in ?? '-'],
              ['Outbound', opn?.wan_out ?? '-'],
              ['Uptime', opn ? formatUptime(opn.uptime) : '-'],
            ]}
          />
          <SummaryCard
            title="Resources"
            rows={[
              ['CPU', `${Math.round((opn?.cpu ?? 0) * 100)}%`],
              ['Memory', `${formatBytes(opn?.mem_used ?? 0)} / ${formatBytes(opn?.mem_total ?? 0)}`],
            ]}
          />
          <SummaryCard
            title="Controls"
            rows={[
              ['Interfaces', `${interfaces.length} reported`],
              ['Gateways', `${gateways.length} reported`],
              ['DHCP leases', `${dhcpLeaseCount}`],
              ['DNS', dnsStatus],
              ['Firewall', `${firewallRules} rules / ${firewallAliases} aliases`],
            ]}
          />
        </div>
      </div>
      <div style={card}>
        <SectionHeader title="Interfaces and Gateways" meta={`${interfaces.length + gateways.length} resources`} />
        <ResourceList
          empty="No interface or gateway inventory reported"
          rows={[
            ...interfaces.map((item, index) => ({
              id: `interface-${rowValue(item, ['identifier', 'name', 'device', 'if'], String(index))}`,
              name: rowValue(item, ['description', 'name', 'identifier', 'device', 'if'], 'interface'),
              meta: `${rowValue(item, ['device', 'if', 'identifier'], 'device')} · ${rowValue(item, ['ipv4', 'addr4', 'address'], 'no IPv4')} · ${rowValue(item, ['macaddr', 'mac'], 'no MAC')}`,
              status: rowValue(item, ['status', 'link_state', 'enabled'], 'unknown'),
              actions: (
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>read</span>
              ),
            })),
            ...gateways.map((item, index) => ({
              id: `gateway-${rowValue(item, ['name', 'gateway', 'interface'], String(index))}`,
              name: rowValue(item, ['name', 'gateway', 'interface'], 'gateway'),
              meta: `${rowValue(item, ['address', 'gateway', 'srcintf'], 'address')} · ${rowValue(item, ['descr', 'description'], 'gateway')}`,
              status: rowValue(item, ['status', 'delay', 'loss'], 'unknown'),
              actions: (
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>read</span>
              ),
            })),
          ]}
        />
      </div>
      <div style={card}>
        <SectionHeader title="DHCP, DNS, and Firewall" meta={`${dhcpLeaseCount} leases`} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <SummaryCard
            title="DHCP"
            rows={[
              ['Leases', `${dhcpLeaseCount}`],
              ['Interfaces', Array.isArray(opn?.dhcp?.interfaces) ? `${opn.dhcp.interfaces.length}` : 'reported'],
            ]}
          />
          <SummaryCard
            title="DNS"
            rows={[
              ['Unbound', dnsStatus],
              [
                'Totals',
                Array.isArray(opn?.dns?.unbound_totals) ? `${opn.dns.unbound_totals.length} samples` : 'reported',
              ],
            ]}
          />
          <SummaryCard
            title="Firewall"
            rows={[
              ['Rules', `${firewallRules}`],
              ['Aliases', `${firewallAliases}`],
            ]}
          />
        </div>
      </div>
      <div style={card}>
        <SectionHeader
          title="OPNsense Services"
          meta={`${services.filter(service => service.running).length}/${services.length} running`}
        />
        <ResourceList
          empty="No OPNsense services reported"
          rows={services.map(service => ({
            id: service.id,
            name: service.name || service.id,
            meta: service.description || service.id,
            status: service.running ? 'online' : 'offline',
            actions: service.locked ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>locked</span>
            ) : (
              opnsenseServiceActions(service)
            ),
          }))}
        />
      </div>
    </div>
  )
}
