import type { ReactNode } from 'react'

import type { HomelabSystemInfo } from './types'
import { matchesQuery, normalizeFilter } from './helpers'
import { ResourceList, SectionHeader, card } from './components'

export default function SystemsSection({
  systems,
  filter,
  module,
  systemActions,
}: {
  systems: HomelabSystemInfo[]
  filter: string
  module: 'storage' | 'power' | 'services'
  systemActions: (system: HomelabSystemInfo) => ReactNode
}) {
  const query = normalizeFilter(filter)
  const moduleNeedles = {
    storage: ['storage', 'backup', 'nas', 'share', 'snapshot', 'restore'],
    power: ['power', 'ups', 'hardware', 'sensor', 'host', 'wake', 'shutdown'],
    services: ['service', 'dns', 'adblock', 'tail', 'tunnel', 'tailscale', 'systemd'],
  }[module]
  const title = {
    storage: 'Storage and Backups',
    power: 'Power and Hardware',
    services: 'Host Services',
  }[module]
  const visibleSystems = systems.filter(system => {
    const haystack = `${system.id} ${system.name} ${system.status} ${system.actions.join(' ')}`.toLowerCase()
    const belongs = moduleNeedles.some(needle => haystack.includes(needle))
    return belongs && matchesQuery(query, system.name, system.status, system.actions.join(' '))
  })
  return (
    <div style={card}>
      <SectionHeader
        title={title}
        meta={`${visibleSystems.filter(s => s.status === 'configured').length}/${visibleSystems.length} configured`}
      />
      <ResourceList
        empty="No systems reported"
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
  )
}
