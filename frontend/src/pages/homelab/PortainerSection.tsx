import type { ReactNode } from 'react'
import { Desktop } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'

import type {
  DockerContainerInfo,
  PortainerConfigAssetInfo,
  PortainerEndpointInfo,
  PortainerImageInfo,
  PortainerInstanceInfo,
  PortainerNetworkInfo,
  PortainerRegistryInfo,
  PortainerSecretInfo,
  PortainerStackInfo,
  PortainerVolumeInfo,
} from './types'
import { formatBytes, matchesQuery, normalizeFilter, shortId } from './helpers'
import { ResourceList, SectionHeader, SummaryCard, card, sectionTitle } from './components'

export default function PortainerSection({
  instances,
  filter,
  instanceActions,
  containerActions,
  stackActions,
  endpointActions,
  imageActions,
  volumeActions,
  networkActions,
  secretActions,
  configActions,
  registryActions,
}: {
  instances: PortainerInstanceInfo[]
  filter: string
  instanceActions: (instance: PortainerInstanceInfo) => ReactNode
  containerActions: (container: DockerContainerInfo) => ReactNode
  stackActions: (stack: PortainerStackInfo) => ReactNode
  endpointActions: (endpoint: PortainerEndpointInfo, instance: PortainerInstanceInfo) => ReactNode
  imageActions: (image: PortainerImageInfo) => ReactNode
  volumeActions: (volume: PortainerVolumeInfo) => ReactNode
  networkActions: (network: PortainerNetworkInfo) => ReactNode
  secretActions: (secret: PortainerSecretInfo) => ReactNode
  configActions: (config: PortainerConfigAssetInfo) => ReactNode
  registryActions: (registry: PortainerRegistryInfo) => ReactNode
}) {
  if (!instances.length) {
    return (
      <EmptyState
        icon={Desktop}
        title="No Portainer providers"
        description="Add Portainer in Settings to control Docker resources."
      />
    )
  }
  const query = normalizeFilter(filter)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {instances.map(instance => {
        const stacks = instance.stacks.filter(stack => matchesQuery(query, stack.name, String(stack.endpoint_id ?? '')))
        const containers = instance.containers.filter(container =>
          matchesQuery(query, container.name, container.image, container.status, container.endpoint_name),
        )
        const images = (instance.images ?? []).filter(image =>
          matchesQuery(query, image.name, image.tags?.join(' '), image.endpoint_name),
        )
        const volumes = (instance.volumes ?? []).filter(volume =>
          matchesQuery(query, volume.name, volume.driver, volume.endpoint_name),
        )
        const networks = (instance.networks ?? []).filter(network =>
          matchesQuery(query, network.name, network.driver, network.scope, network.endpoint_name),
        )
        const secrets = (instance.secrets ?? []).filter(secret =>
          matchesQuery(query, secret.name, secret.endpoint_name, secret.created_at),
        )
        const configs = (instance.configs ?? []).filter(config =>
          matchesQuery(query, config.name, config.endpoint_name, config.created_at),
        )
        const registries = (instance.registries ?? []).filter(registry =>
          matchesQuery(query, registry.name, registry.url, registry.type),
        )
        return (
          <div key={instance.id} style={card}>
            <SectionHeader
              title={instance.name}
              meta={instance.available ? `${instance.endpoints.length} endpoints` : instance.error || 'offline'}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px', marginBottom: '12px' }}>
              {instanceActions(instance)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <SummaryCard title="Stacks" rows={[[instance.name, `${stacks.length}/${instance.stacks.length}`]]} />
              <SummaryCard
                title="Containers"
                rows={[
                  [
                    instance.name,
                    `${containers.filter(c => c.state === 'running').length}/${containers.length} running`,
                  ],
                ]}
              />
              <SummaryCard
                title="Endpoints"
                rows={instance.endpoints.map(endpoint => [endpoint.name, endpoint.status === 1 ? 'up' : 'unknown'])}
              />
              <SummaryCard
                title="Assets"
                rows={[
                  ['Images', `${images.length}/${instance.images?.length ?? 0}`],
                  ['Volumes', `${volumes.length}/${instance.volumes?.length ?? 0}`],
                  ['Networks', `${networks.length}/${instance.networks?.length ?? 0}`],
                  ['Secrets', `${secrets.length}/${instance.secrets?.length ?? 0}`],
                  ['Configs', `${configs.length}/${instance.configs?.length ?? 0}`],
                  ['Registries', `${registries.length}/${instance.registries?.length ?? 0}`],
                ]}
              />
            </div>

            <div style={sectionTitle}>Stacks</div>
            <ResourceList
              empty="No stacks reported"
              rows={stacks.map(stack => ({
                id: String(stack.id),
                name: stack.name,
                meta: `endpoint ${stack.endpoint_id ?? '-'}`,
                status: 'stack',
                actions: stackActions(stack),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Endpoint maintenance</div>
            <ResourceList
              empty="No endpoints reported"
              rows={instance.endpoints.map(endpoint => ({
                id: String(endpoint.id),
                name: endpoint.name,
                meta: endpoint.status === 1 ? 'up' : 'unknown',
                status: endpoint.status === 1 ? 'online' : 'unknown',
                actions: endpointActions(endpoint, instance),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Containers</div>
            <ResourceList
              empty="No containers reported"
              rows={containers.map(container => ({
                id: container.id,
                name: container.name || shortId(container.id),
                meta: `${container.image} · ${container.endpoint_name ?? 'endpoint'} · ${container.status}`,
                status: container.state,
                actions: containerActions(container),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Images</div>
            <ResourceList
              empty="No images reported"
              rows={images.map(image => ({
                id: `${image.endpoint_id ?? 'endpoint'}:${image.id}:${image.name}`,
                name: image.name || shortId(image.id),
                meta: `${formatBytes(image.size)} · ${image.endpoint_name ?? 'endpoint'} · ${image.tags?.length ? image.tags.join(', ') : shortId(image.id)}`,
                status: 'image',
                actions: imageActions(image),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Volumes</div>
            <ResourceList
              empty="No volumes reported"
              rows={volumes.map(volume => ({
                id: `${volume.endpoint_id ?? 'endpoint'}:${volume.id || volume.name}`,
                name: volume.name,
                meta: `${volume.driver ?? 'driver'} · ${volume.endpoint_name ?? 'endpoint'}`,
                status: 'volume',
                actions: volumeActions(volume),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Networks</div>
            <ResourceList
              empty="No networks reported"
              rows={networks.map(network => ({
                id: `${network.endpoint_id ?? 'endpoint'}:${network.id}:${network.name}`,
                name: network.name,
                meta: `${network.driver ?? 'driver'} · ${network.scope ?? 'scope'} · ${network.endpoint_name ?? 'endpoint'}`,
                status: 'network',
                actions: networkActions(network),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Secrets</div>
            <ResourceList
              empty="No secrets reported"
              rows={secrets.map(secret => ({
                id: `${secret.endpoint_id ?? 'endpoint'}:${secret.id}:${secret.name}`,
                name: secret.name,
                meta: `${secret.endpoint_name ?? 'endpoint'} · ${secret.created_at || 'created time unknown'}`,
                status: 'secret',
                actions: secretActions(secret),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Configs</div>
            <ResourceList
              empty="No configs reported"
              rows={configs.map(config => ({
                id: `${config.endpoint_id ?? 'endpoint'}:${config.id}:${config.name}`,
                name: config.name,
                meta: `${config.endpoint_name ?? 'endpoint'} · ${config.created_at || 'created time unknown'}`,
                status: 'config',
                actions: configActions(config),
              }))}
            />

            <div style={{ ...sectionTitle, marginTop: '16px' }}>Registries</div>
            <ResourceList
              empty="No registries reported"
              rows={registries.map(registry => ({
                id: `${instance.id}:${registry.id}`,
                name: registry.name,
                meta: `${registry.url || 'registry'} · type ${registry.type ?? '-'} · ${registry.authentication ? 'auth' : 'anonymous'}`,
                status: 'registry',
                actions: registryActions(registry),
              }))}
            />
          </div>
        )
      })}
    </div>
  )
}
