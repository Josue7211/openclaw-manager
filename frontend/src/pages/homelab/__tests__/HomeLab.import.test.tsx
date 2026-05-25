import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ButtonHTMLAttributes } from 'react'

let homelabData: unknown = undefined
const apiGetMock = vi.hoisted(() => vi.fn<(_path: string) => Promise<unknown | null>>(async () => null))
const apiPostMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ data: Record<string, unknown> }> => ({
      data: { mode: 'portainer-api' },
    }),
  ),
)
const refetchMock = vi.hoisted(() => vi.fn())
const xtermDataHandlers = vi.hoisted(() => [] as Array<(data: string) => void>)
const xtermResizeHandlers = vi.hoisted(() => [] as Array<(size: { cols: number; rows: number }) => void>)

vi.mock('@phosphor-icons/react', () => ({
  ArrowClockwise: () => <svg data-testid="icon-arrow-clockwise" />,
  CaretDown: () => <svg data-testid="icon-caret-down" />,
  CaretRight: () => <svg data-testid="icon-caret-right" />,
  ClipboardText: () => <svg data-testid="icon-clipboard-text" />,
  ClockCounterClockwise: () => <svg data-testid="icon-clock-counter-clockwise" />,
  CornersOut: () => <svg data-testid="icon-corners-out" />,
  Database: () => <svg data-testid="icon-database" />,
  Desktop: () => <svg data-testid="icon-desktop" />,
  Eraser: () => <svg data-testid="icon-eraser" />,
  FileText: () => <svg data-testid="icon-file-text" />,
  Gear: () => <svg data-testid="icon-gear" />,
  Keyboard: () => <svg data-testid="icon-keyboard" />,
  MagnifyingGlass: () => <svg data-testid="icon-magnifying-glass" />,
  Monitor: () => <svg data-testid="icon-monitor" />,
  Play: () => <svg data-testid="icon-play" />,
  Plus: () => <svg data-testid="icon-plus" />,
  Pulse: () => <svg data-testid="icon-pulse" />,
  ShieldCheck: () => <svg data-testid="icon-shield-check" />,
  Stop: () => <svg data-testid="icon-stop" />,
  Terminal: () => <svg data-testid="icon-terminal" />,
  UserCircle: () => <svg data-testid="icon-user-circle" />,
  Warning: () => <svg data-testid="icon-warning" />,
}))

vi.mock('@novnc/novnc', () => ({
  default: class MockRfb {
    scaleViewport = false
    resizeSession = false
    viewOnly = false
    constructor() {}
    disconnect() {}
    sendCtrlAltDel() {}
    addEventListener(_name: string, listener: () => void) {
      listener()
    }
  },
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    focus() {}
    paste() {}
    clear() {}
    getSelection() { return '' }
    write() {}
    dispose() {}
    onData(listener: (data: string) => void) {
      xtermDataHandlers.push(listener)
      return { dispose() {} }
    }
    onResize(listener: (size: { cols: number; rows: number }) => void) {
      xtermResizeHandlers.push(listener)
      return { dispose() {} }
    }
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit() {}
  },
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {},
}))

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

vi.mock('@/hooks/useTauriQuery', () => ({
  useTauriQuery: () => ({
    data: homelabData,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: refetchMock,
    dataUpdatedAt: 0,
  }),
}))

vi.mock('@/components/PageHeader', () => ({
  PageHeader: ({ defaultTitle }: { defaultTitle: string }) => <h1>{defaultTitle}</h1>,
}))

vi.mock('@/components/ui/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}))

vi.mock('@/components/ui/ErrorState', () => ({
  ErrorState: () => <div data-testid="error-state" />,
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: apiGetMock,
    put: vi.fn(async () => ({ data: null })),
    post: apiPostMock,
  },
  getRequestApiKeyForPath: () => undefined,
  getRequestBaseForPath: () => 'http://127.0.0.1:3010',
}))

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

function homelabFixture() {
  return {
    proxmox: {
      nodes: [{ name: 'pve', status: 'online', cpu: 0.2, mem_used: 1024, mem_total: 4096, uptime: 100 }],
      vms: [
        {
          vmid: 100,
          name: 'infra-vm',
          node: 'pve',
          status: 'running',
          cpu: 0.1,
          mem: 1024,
          maxmem: 4096,
          kind: 'qemu',
          config: { memory: '4096', cores: '4' },
          disks: [{ key: 'scsi0', value: 'local-lvm:vm-100-disk-0,size=32G', storage: 'local-lvm', size: '32G' }],
          networks: [{ key: 'net0', value: 'virtio,bridge=vmbr0', bridge: 'vmbr0' }],
          snapshots: [{ name: 'before-upgrade', description: 'Before upgrade', vmstate: false }],
          firewall_rules: [{ pos: 0, type: 'in', action: 'ACCEPT', proto: 'tcp', dport: '443', enable: 1 }],
        },
      ],
      storage: [
        {
          node: 'pve',
          name: 'local-lvm',
          storage_type: 'lvmthin',
          content: 'images,rootdir',
          enabled: true,
          active: true,
          total: 2048,
          used: 1024,
          avail: 1024,
          shared: false,
        },
      ],
      backups: [
        {
          node: 'pve',
          storage: 'local',
          volid: 'local:backup/vzdump-qemu-100-2026_05_13-00_00_00.vma.zst',
          name: 'vzdump-qemu-100',
          kind: 'qemu',
          vmid: 100,
          format: 'vma.zst',
          content: 'backup',
          size: 1024,
          ctime: 0,
          notes: 'nightly',
          protected: false,
        },
      ],
      services: [{ node: 'pve', id: 'chrony', name: 'chrony', description: 'NTP client/server', state: 'running' }],
      tasks: [],
      ha_resources: [{ sid: 'vm:100', resource_type: 'vm', state: 'started', group: 'ha-prod', comment: 'infra' }],
      source: 'api',
    },
    opnsense: {
      status: 'online',
      cpu: 0,
      mem_used: 0,
      mem_total: 0,
      uptime: 0,
      wan_in: '0 B',
      wan_out: '0 B',
      services: [
        { id: 'unbound', name: 'unbound', description: 'Unbound DNS', running: true, locked: false },
        { id: 'kea-dhcp4', name: 'kea-dhcp4', description: 'Kea DHCPv4', running: false, locked: false },
      ],
      interfaces: [{ identifier: 'wan', description: 'WAN', device: 'vtnet0', ipv4: '192.0.2.10', status: 'up' }],
      gateways: [{ name: 'WAN_DHCP', address: '192.0.2.1', status: 'online' }],
      dhcp: { leases: [{ mac: '00:11:22:33:44:55', address: '192.0.2.50', hostname: 'lab-host' }], total: 1 },
      dns: { unbound_status: 'running', unbound_totals: [] },
      firewall: {
        rules: [{ id: 'allow-lan', description: 'Allow LAN' }],
        rule_total: 1,
        aliases: [{ name: 'LAN_NET' }],
        alias_total: 1,
      },
      source: 'api',
    },
    live: { proxmox: true, opnsense: true, portainer: true, docker: true },
    portainer: {
      available: true,
      source: 'portainer',
      instances: [
        {
          id: 'services',
          name: 'Services VM Portainer',
          url: 'https://portainer.local',
          available: true,
          capabilities: {
            version: '2.39.0',
            edition: 'CE',
            docker: true,
            swarm: true,
            kubernetes: true,
            aci: true,
            groups: 1,
            tags: 2,
            users: 1,
            teams: 1,
            app_templates: 1,
            custom_templates: 1,
            swarm_services: 1,
            swarm_nodes: 1,
            swarm_tasks: 1,
            kubernetes_namespaces: 1,
            kubernetes_applications: 1,
            kubernetes_pods: 1,
            kubernetes_services: 1,
            kubernetes_ingresses: 1,
            kubernetes_configmaps: 1,
            kubernetes_secrets: 1,
            kubernetes_volumes: 2,
            kubernetes_crds: 1,
            kubernetes_helm_releases: 1,
            aci_subscriptions: 1,
            aci_resource_groups: 1,
            aci_container_groups: 1,
            settings: true,
            system_status: true,
          },
          groups: [{ id: 7, name: 'production', instance_id: 'services' }],
          tags: [
            { id: 1, name: 'edge', instance_id: 'services' },
            { id: 2, name: 'media', instance_id: 'services' },
          ],
          users: [{ id: 1, username: 'admin', role: 1, teams: [9], instance_id: 'services' }],
          teams: [{ id: 9, name: 'operators', instance_id: 'services' }],
          app_templates: [
            {
              id: 21,
              title: 'redis app template',
              description: 'Redis container template',
              type: 1,
              platform: 'linux',
              categories: ['database'],
              image: 'redis:7',
              instance_id: 'services',
            },
          ],
          custom_templates: [
            {
              id: 12,
              title: 'nginx template',
              description: 'Reusable nginx service',
              type: 1,
              platform: 1,
              instance_id: 'services',
            },
          ],
          endpoints: [
            {
              id: 3,
              name: 'agent-vm',
              status: 1,
              type: 2,
              platform: 'docker',
              connection: 'portainer-agent-docker',
              group_id: 7,
              tags: [1, 2],
              features: ['swarm'],
              docker_info: {
                name: 'agent-vm',
                server_version: '26.1.4',
                operating_system: 'Debian GNU/Linux 12',
                os_type: 'linux',
                architecture: 'x86_64',
                cpus: 4,
                memory_bytes: 8589934592,
                containers: 7,
                containers_running: 5,
                containers_paused: 1,
                containers_stopped: 1,
                images: 12,
                docker_root_dir: '/var/lib/docker',
                driver: 'overlay2',
                swarm_local_node_state: 'active',
                swarm_control_available: true,
              },
            },
            { id: 6, name: 'k8s-prod', status: 1, type: 6, platform: 'kubernetes', connection: 'portainer-agent-kubernetes', group_id: 7, tags: [1], features: ['kubernetes', 'applications', 'helm'] },
            { id: 9, name: 'aci-prod', status: 1, type: 3, platform: 'aci', connection: 'azure-aci', group_id: 7, tags: [1], features: ['aci', 'container-groups'] },
          ],
          stacks: [{ id: 8, name: 'infra-stack', endpoint_id: 3, instance_id: 'services' }],
          containers: [
            {
              id: 'abc123',
              name: 'nginx',
              image: 'nginx:latest',
              status: 'running',
              state: 'running',
              ports: '0.0.0.0:8080->80/tcp',
              created: 1779235200,
              command: 'nginx -g daemon off;',
              network_names: ['frontend'],
              mount_count: 1,
              labels: { 'com.docker.compose.project': 'infra-stack' },
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
              provider: 'portainer',
            },
          ],
          images: [
            {
              id: 'sha256:image',
              name: 'nginx:latest',
              tags: ['nginx:latest'],
              digests: ['nginx@sha256:digest'],
              size: 100,
              shared_size: 32,
              virtual_size: 256,
              containers: 2,
              labels_count: 1,
              created: 1779235200,
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          volumes: [
            {
              id: 'vol1',
              name: 'nginx_data',
              driver: 'local',
              mountpoint: '/var/lib/docker/volumes/nginx_data/_data',
              scope: 'local',
              labels_count: 1,
              options_count: 1,
              usage_ref_count: 2,
              usage_size: 4096,
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          networks: [
            {
              id: 'net1',
              name: 'frontend',
              driver: 'bridge',
              scope: 'local',
              ipam: '172.20.0.0/16 via 172.20.0.1',
              attachable: true,
              internal: false,
              ingress: false,
              enable_ipv6: false,
              containers_count: 1,
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          secrets: [
            {
              id: 'secret1',
              name: 'db_password',
              created_at: '2026-05-12T00:00:00Z',
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          configs: [
            {
              id: 'config1',
              name: 'nginx_conf',
              created_at: '2026-05-12T00:00:00Z',
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          swarm_services: [
            {
              id: 'svc123456789',
              name: 'web-service',
              image: 'nginx:latest',
              mode: 'replicated',
              replicas: 2,
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          swarm_nodes: [
            {
              id: 'node123456789',
              hostname: 'swarm-manager',
              state: 'ready',
              availability: 'active',
              role: 'manager',
              manager_reachability: 'reachable',
              leader: true,
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          swarm_tasks: [
            {
              id: 'task123456789',
              service_id: 'svc123456789',
              node_id: 'node123456789',
              slot: 1,
              desired_state: 'running',
              state: 'running',
              endpoint_id: 3,
              endpoint_name: 'agent-vm',
              instance_id: 'services',
            },
          ],
          kubernetes_namespaces: [
            { id: 'ns1', name: 'apps', status: 'Active', created_at: '2026-05-12T00:00:00Z', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_applications: [
            { id: 'deploy1', name: 'api-deployment', namespace: 'apps', kind: 'Deployment', ready: 2, replicas: 2, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_pods: [
            { id: 'pod1', name: 'api-deployment-7d9c', namespace: 'apps', status: 'Running', node: 'worker-1', restart_count: 0, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_services: [
            { id: 'svc1', name: 'api-service', namespace: 'apps', service_type: 'ClusterIP', cluster_ip: '10.96.0.10', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_ingresses: [
            { id: 'ing1', name: 'api-ingress', namespace: 'apps', hosts: 'api.example.test', class_name: 'nginx', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_configmaps: [
            { id: 'cm1', name: 'api-config', namespace: 'apps', keys: 2, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_secrets: [
            { id: 'ksec1', name: 'api-secret', namespace: 'apps', secret_type: 'Opaque', keys: 1, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_volumes: [
            { id: 'pvc1', name: 'api-data', namespace: 'apps', kind: 'PersistentVolumeClaim', status: 'Bound', storage_class: 'local-path', capacity: '1Gi', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
            { id: 'pv1', name: 'pv-api-data', kind: 'PersistentVolume', status: 'Bound', storage_class: 'local-path', capacity: '1Gi', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_crds: [
            { id: 'crd1', name: 'widgets.example.com', group: 'example.com', scope: 'Namespaced', kind: 'Widget', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          kubernetes_helm_releases: [
            { id: '6:nginx', name: 'nginx', namespace: 'apps', chart: 'nginx-15.0.0', app_version: '1.27.0', revision: 1, status: 'deployed', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
          ],
          aci_subscriptions: [
            { id: 'sub-1', name: 'Production Subscription', endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
          ],
          aci_resource_groups: [
            { id: '/subscriptions/sub-1/resourceGroups/rg-prod', name: 'rg-prod', location: 'eastus', subscription_id: 'sub-1', subscription_name: 'Production Subscription', endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
          ],
          aci_container_groups: [
            { id: '/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci', name: 'web-aci', location: 'eastus', resource_group: 'rg-prod', subscription_id: 'sub-1', subscription_name: 'Production Subscription', status: 'Running', os_type: 'Linux', ip_address: '203.0.113.10', ip_type: 'Public', ports: [{ port: 80, protocol: 'TCP' }], image: 'nginx:latest', cpu: 1, memory_gb: 1, env_count: 1, endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
          ],
          registries: [
            {
              id: 4,
              name: 'ghcr',
              url: 'ghcr.io',
              type: 1,
              authentication: true,
              instance_id: 'services',
            },
          ],
        },
      ],
      capabilities: [
        {
          instance_id: 'services',
          instance_name: 'Services VM Portainer',
          available: true,
          capabilities: {
            version: '2.39.0',
            edition: 'CE',
            docker: true,
            swarm: true,
            kubernetes: true,
            aci: true,
            groups: 1,
            tags: 2,
            users: 1,
            teams: 1,
            app_templates: 1,
            custom_templates: 1,
            swarm_services: 1,
            swarm_nodes: 1,
            swarm_tasks: 1,
            kubernetes_namespaces: 1,
            kubernetes_applications: 1,
            kubernetes_pods: 1,
            kubernetes_services: 1,
            kubernetes_ingresses: 1,
            kubernetes_configmaps: 1,
            kubernetes_secrets: 1,
            kubernetes_volumes: 2,
            kubernetes_crds: 1,
            kubernetes_helm_releases: 1,
            aci_subscriptions: 1,
            aci_resource_groups: 1,
            aci_container_groups: 1,
            settings: true,
            system_status: true,
          },
        },
      ],
      groups: [{ id: 7, name: 'production', instance_id: 'services' }],
      tags: [
        { id: 1, name: 'edge', instance_id: 'services' },
        { id: 2, name: 'media', instance_id: 'services' },
      ],
      users: [{ id: 1, username: 'admin', role: 1, teams: [9], instance_id: 'services' }],
      teams: [{ id: 9, name: 'operators', instance_id: 'services' }],
      app_templates: [
        {
          id: 21,
          title: 'redis app template',
          description: 'Redis container template',
          type: 1,
          platform: 'linux',
          categories: ['database'],
          image: 'redis:7',
          instance_id: 'services',
        },
      ],
      custom_templates: [
        {
          id: 12,
          title: 'nginx template',
          description: 'Reusable nginx service',
          type: 1,
          platform: 1,
          instance_id: 'services',
        },
      ],
      endpoints: [
        {
          id: 3,
          name: 'agent-vm',
          status: 1,
          type: 2,
          platform: 'docker',
          connection: 'portainer-agent-docker',
          group_id: 7,
          tags: [1, 2],
          features: ['swarm'],
          docker_info: {
            name: 'agent-vm',
            server_version: '26.1.4',
            operating_system: 'Debian GNU/Linux 12',
            os_type: 'linux',
            architecture: 'x86_64',
            cpus: 4,
            memory_bytes: 8589934592,
            containers: 7,
            containers_running: 5,
            containers_paused: 1,
            containers_stopped: 1,
            images: 12,
            docker_root_dir: '/var/lib/docker',
            driver: 'overlay2',
            swarm_local_node_state: 'active',
            swarm_control_available: true,
          },
        },
        { id: 6, name: 'k8s-prod', status: 1, type: 6, platform: 'kubernetes', connection: 'portainer-agent-kubernetes', group_id: 7, tags: [1], features: ['kubernetes', 'applications', 'helm'] },
        { id: 9, name: 'aci-prod', status: 1, type: 3, platform: 'aci', connection: 'azure-aci', group_id: 7, tags: [1], features: ['aci', 'container-groups'] },
      ],
      stacks: [{ id: 8, name: 'infra-stack', endpoint_id: 3, instance_id: 'services' }],
      containers: [
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          status: 'running',
          state: 'running',
          ports: '0.0.0.0:8080->80/tcp',
          created: 1779235200,
          command: 'nginx -g daemon off;',
          network_names: ['frontend'],
          mount_count: 1,
          labels: { 'com.docker.compose.project': 'infra-stack' },
          endpoint_id: 3,
          endpoint_name: 'agent-vm',
          instance_id: 'services',
          provider: 'portainer',
        },
      ],
      swarm_services: [
        {
          id: 'svc123456789',
          name: 'web-service',
          image: 'nginx:latest',
          mode: 'replicated',
          replicas: 2,
          endpoint_id: 3,
          endpoint_name: 'agent-vm',
          instance_id: 'services',
        },
      ],
      swarm_nodes: [
        {
          id: 'node123456789',
          hostname: 'swarm-manager',
          state: 'ready',
          availability: 'active',
          role: 'manager',
          manager_reachability: 'reachable',
          leader: true,
          endpoint_id: 3,
          endpoint_name: 'agent-vm',
          instance_id: 'services',
        },
      ],
      swarm_tasks: [
        {
          id: 'task123456789',
          service_id: 'svc123456789',
          node_id: 'node123456789',
          slot: 1,
          desired_state: 'running',
          state: 'running',
          endpoint_id: 3,
          endpoint_name: 'agent-vm',
          instance_id: 'services',
        },
      ],
      kubernetes_namespaces: [
        { id: 'ns1', name: 'apps', status: 'Active', created_at: '2026-05-12T00:00:00Z', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_applications: [
        { id: 'deploy1', name: 'api-deployment', namespace: 'apps', kind: 'Deployment', ready: 2, replicas: 2, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_pods: [
        { id: 'pod1', name: 'api-deployment-7d9c', namespace: 'apps', status: 'Running', node: 'worker-1', restart_count: 0, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_services: [
        { id: 'svc1', name: 'api-service', namespace: 'apps', service_type: 'ClusterIP', cluster_ip: '10.96.0.10', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_ingresses: [
        { id: 'ing1', name: 'api-ingress', namespace: 'apps', hosts: 'api.example.test', class_name: 'nginx', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_configmaps: [
        { id: 'cm1', name: 'api-config', namespace: 'apps', keys: 2, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_secrets: [
        { id: 'ksec1', name: 'api-secret', namespace: 'apps', secret_type: 'Opaque', keys: 1, endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_volumes: [
        { id: 'pvc1', name: 'api-data', namespace: 'apps', kind: 'PersistentVolumeClaim', status: 'Bound', storage_class: 'local-path', capacity: '1Gi', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
        { id: 'pv1', name: 'pv-api-data', kind: 'PersistentVolume', status: 'Bound', storage_class: 'local-path', capacity: '1Gi', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_crds: [
        { id: 'crd1', name: 'widgets.example.com', group: 'example.com', scope: 'Namespaced', kind: 'Widget', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      kubernetes_helm_releases: [
        { id: '6:nginx', name: 'nginx', namespace: 'apps', chart: 'nginx-15.0.0', app_version: '1.27.0', revision: 1, status: 'deployed', endpoint_id: 6, endpoint_name: 'k8s-prod', instance_id: 'services' },
      ],
      aci_subscriptions: [
        { id: 'sub-1', name: 'Production Subscription', endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
      ],
      aci_resource_groups: [
        { id: '/subscriptions/sub-1/resourceGroups/rg-prod', name: 'rg-prod', location: 'eastus', subscription_id: 'sub-1', subscription_name: 'Production Subscription', endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
      ],
      aci_container_groups: [
        { id: '/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci', name: 'web-aci', location: 'eastus', resource_group: 'rg-prod', subscription_id: 'sub-1', subscription_name: 'Production Subscription', status: 'Running', os_type: 'Linux', ip_address: '203.0.113.10', ip_type: 'Public', ports: [{ port: 80, protocol: 'TCP' }], image: 'nginx:latest', cpu: 1, memory_gb: 1, env_count: 1, endpoint_id: 9, endpoint_name: 'aci-prod', instance_id: 'services' },
      ],
    },
    docker: { available: false, source: 'portainer-shadowed', hosts: [], containers: [] },
    diagnostics: { providers: [] },
    systems: [
      {
        id: 'host-services',
        name: 'Host services',
        status: 'configured',
        actions: ['open', 'healthcheck'],
        primary_url: 'http://127.0.0.1:8077',
      },
    ],
    control: {
      actions: [
        { provider: 'proxmox', resource_type: 'node', actions: ['shell', 'create-vm', 'create-lxc', 'reboot', 'shutdown'] },
        { provider: 'proxmox', resource_type: 'vm', actions: ['start', 'shutdown', 'reboot', 'stop', 'set-memory', 'set-cpu', 'set-network', 'add-network', 'remove-network', 'resize-disk', 'add-disk', 'remove-disk', 'snapshot', 'rollback-snapshot', 'delete-snapshot', 'backup', 'migrate', 'clone', 'console', 'set-name', 'set-description', 'set-tags', 'set-onboot', 'set-protection', 'set-firewall', 'add-firewall-rule', 'update-firewall-rule', 'delete-firewall-rule', 'add-ha', 'set-ha-state', 'remove-ha', 'delete'] },
        { provider: 'proxmox', resource_type: 'lxc', actions: ['start', 'shutdown', 'reboot', 'stop', 'set-memory', 'set-cpu', 'set-network', 'add-network', 'remove-network', 'resize-disk', 'add-disk', 'remove-disk', 'snapshot', 'rollback-snapshot', 'delete-snapshot', 'backup', 'migrate', 'clone', 'console', 'set-name', 'set-description', 'set-tags', 'set-onboot', 'set-protection', 'set-firewall', 'add-firewall-rule', 'update-firewall-rule', 'delete-firewall-rule', 'add-ha', 'set-ha-state', 'remove-ha', 'delete'] },
        { provider: 'proxmox', resource_type: 'storage', actions: ['enable-storage', 'disable-storage'] },
        { provider: 'proxmox', resource_type: 'backup', actions: ['restore', 'delete-backup'] },
        { provider: 'proxmox', resource_type: 'ha', actions: ['set-ha-state', 'remove-ha'] },
        { provider: 'proxmox', resource_type: 'service', actions: ['start', 'stop', 'restart', 'reload'] },
        { provider: 'proxmox', resource_type: 'task', actions: ['task-log', 'task-status', 'stop-task'] },
      ],
      capabilities: [
        { provider: 'proxmox', resource_type: 'node', action: 'shell', status: 'implemented', mode: 'termproxy-vncwebsocket' },
        { provider: 'proxmox', resource_type: 'vm', action: 'console', status: 'implemented', mode: 'vncproxy-vncwebsocket' },
        { provider: 'proxmox', resource_type: 'lxc', action: 'console', status: 'implemented', mode: 'vncproxy-vncwebsocket' },
        { provider: 'proxmox', resource_type: 'storage', action: 'reload-storage', status: 'blocked', reason: 'No backend handler exists.' },
      ],
    },
  }
}

function clickModuleButton(label: string) {
  const button = screen.getAllByText(label).find(element => element.tagName === 'BUTTON')
  if (!button) throw new Error(`No module button found for ${label}`)
  fireEvent.click(button)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  xtermDataHandlers.length = 0
  xtermResizeHandlers.length = 0
  homelabData = undefined
  vi.restoreAllMocks()
  apiGetMock.mockReset()
  apiGetMock.mockResolvedValue(null)
  apiPostMock.mockReset()
  apiPostMock.mockResolvedValue({ data: { mode: 'portainer-api' } })
  refetchMock.mockReset()
  if (localStorageDescriptor) {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor)
  }
  try {
    window.localStorage.removeItem('proxmox-console-task-activity')
  } catch {
    // Some tests deliberately make localStorage unavailable.
  }
})

describe('HomeLab import safety', () => {
  it('renders when localStorage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('localStorage unavailable')
      },
    })

    const mod = await import('../../HomeLab')
    const HomeLab = mod.default

    expect(() => render(<HomeLab />)).not.toThrow()
  })

  it('hides Docker SSH host when Portainer owns the endpoint', async () => {
    homelabData = {
      proxmox: { nodes: [], vms: [], source: 'api' },
      opnsense: {
        status: 'online',
        cpu: 0,
        mem_used: 0,
        mem_total: 0,
        uptime: 0,
        wan_in: '0 B',
        wan_out: '0 B',
        services: [],
        source: 'api',
      },
      live: { proxmox: true, opnsense: true, portainer: true, docker: true },
      portainer: {
        available: true,
        source: 'portainer',
        instances: [
          {
            id: 'services',
            name: 'Services VM Portainer',
            url: 'https://portainer.local',
            available: true,
            capabilities: {
              version: '2.39.0',
              edition: 'CE',
              docker: true,
              swarm: false,
              kubernetes: false,
              aci: false,
              groups: 0,
              tags: 0,
              settings: true,
              system_status: true,
            },
            endpoints: [{ id: 3, name: 'agent-vm', status: 1, type: 1, platform: 'docker', connection: 'docker-api', group_id: 0, tags: [], features: [] }],
            stacks: [],
            containers: [],
            images: [],
            volumes: [],
            networks: [],
            secrets: [],
            configs: [],
            registries: [
              { id: 4, name: 'ghcr', url: 'ghcr.io', type: 1, authentication: true, instance_id: 'services' },
            ],
          },
        ],
        containers: [],
      },
      docker: {
        available: true,
        source: 'docker-ssh',
        hosts: [
          {
            id: 'agent-vm',
            name: 'Agent VM',
            host: 'Agent VM',
            available: true,
            containers: [],
          },
        ],
        containers: [],
      },
      systems: [],
    }

    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')

    expect(screen.getAllByText('Services VM Portainer').length).toBeGreaterThan(0)
    expect(screen.queryByText('Agent VM Docker')).not.toBeInTheDocument()
  })

  it('renders Portainer inventory and Proxmox hardware controls', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    expect(screen.getAllByText('nginx').length).toBeGreaterThan(0)
    expect(screen.getByText('duplicate')).toBeInTheDocument()
    expect(screen.getByText('recreate')).toBeInTheDocument()
    expect(screen.getAllByText('infra-stack').length).toBeGreaterThan(0)
    expect(screen.getAllByText('nginx_data').length).toBeGreaterThan(0)
    expect(screen.getAllByText('frontend').length).toBeGreaterThan(0)
    expect(screen.getAllByText('db_password').length).toBeGreaterThan(0)
    expect(screen.getAllByText('nginx_conf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ghcr').length).toBeGreaterThan(0)
    expect(screen.getByText('inspect-endpoint')).toBeInTheDocument()
    expect(screen.getByText('events')).toBeInTheDocument()
    expect(screen.getByText('processes')).toBeInTheDocument()
    expect(screen.getByText('changes')).toBeInTheDocument()
    expect(screen.getByText('inspect-stack')).toBeInTheDocument()
    expect(screen.getByText('stack-logs')).toBeInTheDocument()
    expect(screen.getByText('start-stack')).toBeInTheDocument()
    expect(screen.getByText('stop-stack')).toBeInTheDocument()
    expect(screen.getByText('create-stack')).toBeInTheDocument()
    expect(screen.getByText('create-service')).toBeInTheDocument()
    expect(screen.getByText('create-secret')).toBeInTheDocument()
    expect(screen.getByText('create-config')).toBeInTheDocument()
    expect(screen.getByText('create-endpoint-group')).toBeInTheDocument()
    expect(screen.getByText('create-tag')).toBeInTheDocument()
    expect(screen.getByText('create-user')).toBeInTheDocument()
    expect(screen.getByText('create-team')).toBeInTheDocument()
    expect(screen.getByText('create-custom-template')).toBeInTheDocument()
    expect(screen.getByText('inspect-settings')).toBeInTheDocument()
    expect(screen.getByText('update-settings')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Secrets 1'))
    expect(screen.getByText('inspect-secret')).toBeInTheDocument()
    expect(screen.getByText('remove-secret')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Configs 1'))
    expect(screen.getByText('inspect-config')).toBeInTheDocument()
    expect(screen.getByText('remove-config')).toBeInTheDocument()

    expect(screen.getByText('create-registry')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Registries 1'))
    expect(screen.getByText('inspect-registry')).toBeInTheDocument()
    expect(screen.getByText('update-registry')).toBeInTheDocument()
    expect(screen.getByText('remove-registry')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Endpoint Groups 1'))
    expect(screen.getByText('inspect-endpoint-group')).toBeInTheDocument()
    expect(screen.getByText('update-endpoint-group')).toBeInTheDocument()
    expect(screen.getByText('remove-endpoint-group')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Tags 2'))
    expect(screen.getByText('inspect-tag')).toBeInTheDocument()
    expect(screen.getByText('update-tag')).toBeInTheDocument()
    expect(screen.getByText('remove-tag')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Users 1'))
    expect(screen.getByText('inspect-user')).toBeInTheDocument()
    expect(screen.getByText('update-user')).toBeInTheDocument()
    expect(screen.getByText('remove-user')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Teams 1'))
    expect(screen.getByText('inspect-team')).toBeInTheDocument()
    expect(screen.getByText('update-team')).toBeInTheDocument()
    expect(screen.getByText('remove-team')).toBeInTheDocument()

    fireEvent.click(screen.getByText('App Templates 1'))
    expect(screen.getByText('app-template-file')).toBeInTheDocument()
    expect(screen.getByText('deploy-app-template')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Custom Templates 1'))
    expect(screen.getByText('inspect-custom-template')).toBeInTheDocument()
    expect(screen.getByText('custom-template-file')).toBeInTheDocument()
    expect(screen.getByText('deploy-custom-template')).toBeInTheDocument()
    expect(screen.getByText('update-custom-template')).toBeInTheDocument()
    expect(screen.getByText('remove-custom-template')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Networks 1'))
    expect(screen.getByText('connect-container')).toBeInTheDocument()
    expect(screen.getByText('disconnect-container')).toBeInTheDocument()
    expect(screen.getByText('inspect-network')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Images 1'))
    expect(screen.getByText('inspect-image')).toBeInTheDocument()
    expect(screen.getByText('history-image')).toBeInTheDocument()
    expect(screen.getByText('tag-image')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Volumes 1'))
    expect(screen.getByText('inspect-volume')).toBeInTheDocument()

    fireEvent.click(screen.getByText('k8s-prod'))
    expect(screen.getByText('Helm Releases 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Helm Releases 1'))
    expect(screen.getAllByText('inspect-helm-release').length).toBeGreaterThan(0)
    expect(screen.getAllByText('helm-release-history').length).toBeGreaterThan(0)
    expect(screen.getAllByText('rollback-helm-release').length).toBeGreaterThan(0)
    expect(screen.getAllByText('uninstall-helm-release').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('aci-prod'))
    expect(screen.getByText('ACI Container Groups 1')).toBeInTheDocument()
    expect(screen.getByText('create-aci-container-group')).toBeInTheDocument()
    fireEvent.click(screen.getByText('ACI Container Groups 1'))
    expect(screen.getAllByText('inspect-aci-container-group').length).toBeGreaterThan(0)
    expect(screen.getAllByText('delete-aci-container-group').length).toBeGreaterThan(0)

    clickModuleButton('Proxmox')
    expect(screen.getByText('infra-vm')).toBeInTheDocument()
    expect(screen.getAllByText('set-description').length).toBeGreaterThan(0)
    expect(screen.getAllByText('add-disk').length).toBeGreaterThan(0)
    expect(screen.getAllByText('remove-disk').length).toBeGreaterThan(0)
    expect(screen.getAllByText('add-network').length).toBeGreaterThan(0)
    expect(screen.getAllByText('create-vm').length).toBeGreaterThan(0)
    expect(screen.getAllByText('create-lxc').length).toBeGreaterThan(0)
    expect(screen.getAllByText('rollback-snapshot').length).toBeGreaterThan(0)
    expect(screen.getAllByText('delete-snapshot').length).toBeGreaterThan(0)
    expect(screen.getAllByText('backup').length).toBeGreaterThan(0)
    expect(screen.getAllByText('add-firewall-rule').length).toBeGreaterThan(0)
    expect(screen.getAllByText('update-firewall-rule').length).toBeGreaterThan(0)
    expect(screen.getAllByText('delete-firewall-rule').length).toBeGreaterThan(0)
    expect(screen.getAllByText('disable-storage').length).toBeGreaterThan(0)
    expect(screen.getByText('vm:100')).toBeInTheDocument()
    expect(screen.getAllByText('set-ha-state').length).toBeGreaterThan(0)
    expect(screen.getAllByText('remove-ha').length).toBeGreaterThan(0)

    clickModuleButton('Network')
    expect(screen.getByText('OPNsense Services')).toBeInTheDocument()
    expect(screen.getByText('Unbound DNS')).toBeInTheDocument()
    expect(screen.getAllByText('restart').length).toBeGreaterThan(0)
    expect(screen.getAllByText('start').length).toBeGreaterThan(0)

    clickModuleButton('Storage/Backups')
    expect(screen.getByText('local-lvm (pve)')).toBeInTheDocument()
    expect(screen.getByText('vzdump-qemu-100')).toBeInTheDocument()
    expect(screen.getByText('delete-backup')).toBeInTheDocument()
  })

  it('renders route-specific HomeLab modules', async () => {
    const fixture = homelabFixture()
    homelabData = {
      ...fixture,
      proxmox: {
        ...fixture.proxmox,
        vms: fixture.proxmox.vms.map(vm => ({ ...vm, node: '' })),
      },
    }
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      binaryType = ''
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      sent: string[] = []
      constructor(public url: string) {
        socketInstances.push(this)
        setTimeout(() => this.onopen?.(), 0)
      }
      send(data: string) {
        this.sent.push(data)
      }
      close() {
        this.onclose?.()
      }
    }
    const socketInstances: MockWebSocket[] = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      observe() {}
      disconnect() {}
    })
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    const PortainerModule = (await import('../PortainerModule')).default

    const { unmount } = render(<ProxmoxModule />)
    expect(screen.getByTestId('proxmox-console-shell')).toBeInTheDocument()
    expect(screen.getByText('Proxmox VE')).toBeInTheDocument()
    expect(screen.getByText('Server View')).toBeInTheDocument()
    expect(screen.getByText('Native')).toBeInTheDocument()
    expect(screen.getByText('Classic')).toBeInTheDocument()
    expect(screen.getByText('Infra graph')).toBeInTheDocument()
    expect(screen.getByText('Inspector')).toBeInTheDocument()
    expect(screen.getByText('Risk')).toBeInTheDocument()
    expect(screen.getByText('Backup')).toBeInTheDocument()
    expect(screen.getByText('HA')).toBeInTheDocument()
    expect(screen.getByText('infra-vm')).toBeInTheDocument()

    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'shell-1',
        websocketUrl: '/api/homelab/proxmox/shell/ws?sessionId=shell-1',
      },
    })
    fireEvent.click(screen.getAllByText('pve')[0])
    expect(screen.getByText('Node Services')).toBeInTheDocument()
    const shellButton = screen.getAllByRole('button', { name: 'Shell' })[0]!
    fireEvent.click(shellButton)
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/proxmox/shell/session',
        { node: 'pve' },
      ),
    )
    await waitFor(() => expect(socketInstances.length).toBeGreaterThan(0))
    socketInstances[0]!.onmessage?.({ data: 'OK' })
    await waitFor(() => expect(socketInstances[0]!.sent).toContain('1:80:24:'))
    xtermDataHandlers[0]?.('ls\n')
    expect(socketInstances[0]!.sent).toContain('0:3:ls\n')
    xtermResizeHandlers[0]?.({ cols: 132, rows: 43 })
    expect(socketInstances[0]!.sent).toContain('1:132:43:')

    fireEvent.click(screen.getByRole('button', { name: /Storage 1/ }))
    fireEvent.click(screen.getByText('local-lvm'))
    expect(screen.getAllByRole('button', { name: 'Reload' })).toHaveLength(1)

    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'console-1',
        websocketUrl: '/api/homelab/proxmox/console/ws?sessionId=console-1',
        password: 'ticket',
      },
    })
    fireEvent.click(screen.getByText('100 (infra-vm)'))
    expect(screen.getAllByText('Hardware').length).toBeGreaterThan(0)
    expect(screen.getByText('Snapshots')).toBeInTheDocument()
    const consoleButton = screen.getAllByRole('button', { name: 'Console' })[0]!
    fireEvent.click(consoleButton)
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/proxmox/console/session',
        { node: 'pve', kind: 'qemu', vmid: 100 },
      ),
    )
    unmount()

    render(<PortainerModule />)
    expect(screen.getByTestId('portainer-parity-console')).toBeInTheDocument()
    expect(screen.getByText('HomeLab / Portainer')).toBeInTheDocument()
    expect(screen.getByText('Portainer parity console')).toBeInTheDocument()
    expect(screen.getByText(/Target CE 2.39 LTS/)).toBeInTheDocument()
    expect(screen.getByText('2.39.0')).toBeInTheDocument()
    expect(screen.getByText('Docker, Swarm, Kubernetes, ACI')).toBeInTheDocument()
    expect(screen.getAllByText('Parity Gate').length).toBeGreaterThan(0)
    expect(screen.getByText(/parity rows failing/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }))
    expect(screen.getByText('Runtime capability detection')).toBeInTheDocument()
    expect(screen.getByText('production')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('operators')).toBeInTheDocument()
    expect(screen.getByText('redis app template')).toBeInTheDocument()
    expect(screen.getByText('nginx template')).toBeInTheDocument()
    expect(screen.getByText('ghcr')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Swarm/ }))
    expect(screen.getByText('Swarm services')).toBeInTheDocument()
    expect(screen.getByText('web-service')).toBeInTheDocument()
    expect(screen.getByText('swarm-manager')).toBeInTheDocument()
    expect(screen.getByText('task12345678')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Kubernetes/ }))
    expect(screen.getByText('Kubernetes namespaces')).toBeInTheDocument()
    expect(screen.getAllByText('apps').length).toBeGreaterThan(0)
    expect(screen.getByText('api-deployment')).toBeInTheDocument()
    expect(screen.getByText('api-deployment-7d9c')).toBeInTheDocument()
    expect(screen.getByText('api-service')).toBeInTheDocument()
    expect(screen.getByText('api-ingress')).toBeInTheDocument()
    expect(screen.getByText('api-config')).toBeInTheDocument()
    expect(screen.getByText('api-secret')).toBeInTheDocument()
    expect(screen.getByText('api-data')).toBeInTheDocument()
    expect(screen.getByText('widgets.example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ACI/ }))
    expect(screen.getByText('ACI inventory')).toBeInTheDocument()
    expect(screen.getAllByText('Production Subscription').length).toBeGreaterThan(0)
    expect(screen.getAllByText('rg-prod').length).toBeGreaterThan(0)
    expect(screen.getAllByText('web-aci').length).toBeGreaterThan(0)
    expect(screen.getByText('203.0.113.10 · 80/TCP')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Docker/ }))
    expect(screen.getAllByText('nginx').length).toBeGreaterThan(0)
    expect(screen.getByText('Docker environments')).toBeInTheDocument()
    expect(screen.getByText('Docker 26.1.4')).toBeInTheDocument()
    expect(screen.getByText('Debian GNU/Linux 12 · linux · x86_64')).toBeInTheDocument()
    expect(screen.getByText('4 CPUs · 8.6 GB RAM')).toBeInTheDocument()
    expect(screen.getByText('7 containers (5 running) · 12 images')).toBeInTheDocument()
    expect(screen.getByText('overlay2 · /var/lib/docker')).toBeInTheDocument()
    expect(screen.getByText('0.0.0.0:8080->80/tcp')).toBeInTheDocument()
    expect(screen.getByText('frontend · 1 mounts · 1 labels')).toBeInTheDocument()
    expect(screen.getAllByText('Images').length).toBeGreaterThan(0)
    expect(screen.getAllByText('nginx:latest').length).toBeGreaterThan(0)
    expect(screen.getByText('nginx@sha256:digest')).toBeInTheDocument()
    expect(screen.getByText('2 containers · 1 labels · virtual 256 B · shared 32 B')).toBeInTheDocument()
    expect(screen.getByText('Volumes and networks')).toBeInTheDocument()
    expect(screen.getAllByText('nginx_data').length).toBeGreaterThan(0)
    expect(screen.getByText('local · 1 labels · 1 options · 2 refs · 4096 B')).toBeInTheDocument()
    expect(screen.getAllByText('frontend').length).toBeGreaterThan(0)
    expect(screen.getByText('172.20.0.0/16 via 172.20.0.1')).toBeInTheDocument()
    expect(screen.getByText('attachable')).toBeInTheDocument()
    expect(screen.getByText('Secrets and configs')).toBeInTheDocument()
    expect(screen.getAllByText('db_password').length).toBeGreaterThan(0)
    expect(screen.getAllByText('nginx_conf').length).toBeGreaterThan(0)
  })

  it('renders Portainer-specific audit entries in the dedicated Activity view', async () => {
    homelabData = homelabFixture()
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/audit-log?resource_type=homelab_control&limit=25') {
        return {
          data: [
            {
              id: 11,
              action: 'homelab_control',
              resource_type: 'homelab',
              resource_id: 'stack-8',
              created_at: '2026-05-13T04:00:00Z',
              details: {
                provider: 'portainer',
                instance_id: 'services',
                resource_type: 'stack',
                resource_id: '8',
                action: 'delete',
                destructive: true,
                confirmation_supplied: true,
                target_name: 'infra-stack',
                endpoint_id: 3,
              },
            },
            {
              id: 12,
              action: 'homelab_control',
              resource_type: 'homelab',
              resource_id: '100',
              created_at: '2026-05-13T03:00:00Z',
              details: {
                provider: 'proxmox',
                resource_type: 'vm',
                resource_id: '100',
                action: 'start',
                target_name: 'infra-vm',
              },
            },
          ],
        }
      }
      return null
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Activity/ }))

    expect(await screen.findByText('Portainer control audit')).toBeInTheDocument()
    expect(screen.getByText('infra-stack')).toBeInTheDocument()
    expect(screen.getByText('destructive · confirmed')).toBeInTheDocument()
    expect(screen.getByText('instance services · endpoint 3')).toBeInTheDocument()
    expect(screen.queryByText('infra-vm')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Audit' }))
    await waitFor(() =>
      expect(apiGetMock).toHaveBeenCalledWith('/api/audit-log?resource_type=homelab_control&limit=25'),
    )
  })

  it('edits Portainer stacks through the dedicated CodeMirror gateway editor', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          response: { logs: 'services:\n  app:\n    image: nginx:latest\n' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'update-stack',
          response: {},
        },
      })
    vi.stubGlobal('prompt', vi.fn(() => 'infra-stack'))
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getAllByText('infra-stack').find(element => element.tagName === 'BUTTON')!)
    fireEvent.click(screen.getAllByRole('button', { name: 'update-stack' })[0]!)

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Edit Portainer stack' })).toBeInTheDocument())
    const editorDialog = screen.getByRole('dialog', { name: 'Edit Portainer stack' })
    expect(screen.getByTestId('portainer-compose-codemirror')).toBeInTheDocument()
    expect(screen.getByTestId('portainer-env-codemirror')).toBeInTheDocument()
    expect(editorDialog.querySelector('textarea#portainer-compose-yaml')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Update Stack' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenLastCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'stack',
          resourceId: '8',
          action: 'update-stack',
          args: expect.objectContaining({
            stack_file_content: 'services:\n  app:\n    image: nginx:latest\n',
            prune: true,
          }),
          confirmation: 'infra-stack',
        }),
      ),
    )
  })

  it('fetches Portainer endpoint events through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        response: {
          logs: [
            '{"time":1779235200,"Type":"container","Action":"start","status":"start","id":"abc123","Actor":{"Attributes":{"name":"nginx","image":"nginx:latest"}}}',
            '{"time":1779235260,"Type":"network","Action":"create","id":"net123","Actor":{"Attributes":{"name":"frontend"}}}',
          ].join('\n') + '\n',
        },
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'events' }))
    const requestDialog = within(screen.getByRole('dialog'))
    fireEvent.change(requestDialog.getByLabelText('Type filter'), { target: { value: 'container' } })
    fireEvent.change(requestDialog.getByLabelText('Event/action filter'), { target: { value: 'start' } })
    fireEvent.click(requestDialog.getByRole('button', { name: 'events' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '3',
          action: 'events',
          args: expect.objectContaining({
            since: expect.any(Number),
            type: 'container',
            event: 'start',
          }),
        }),
      ),
    )
    await screen.findByText('Docker events')
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Docker events')).toBeInTheDocument()
    expect(dialog.getByText('2 of 2 events matched')).toBeInTheDocument()
    expect(dialog.getAllByText('container').length).toBeGreaterThan(0)
    expect(dialog.getAllByText('start').length).toBeGreaterThan(0)
    expect(dialog.getAllByText('nginx').length).toBeGreaterThan(0)
    expect(dialog.getAllByText(/image=nginx:latest/).length).toBeGreaterThan(0)
    fireEvent.change(dialog.getByLabelText('Filter displayed Docker events'), { target: { value: 'nginx' } })
    expect(dialog.getByText('1 of 2 events matched')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: /View event nginx start/ }))
    expect(dialog.getByText('Event detail')).toBeInTheDocument()
  })

  it('opens Portainer endpoint events follow through an xterm terminal websocket session', async () => {
    homelabData = homelabFixture()
    const socketInstances: Array<{ url: string; close: () => void; onopen: (() => void) | null }> = []
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      binaryType = ''
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      constructor(public url: string) {
        socketInstances.push(this)
        setTimeout(() => this.onopen?.(), 0)
      }
      send() {}
      close() {
        this.onclose?.()
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      observe() {}
      disconnect() {}
    })
    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'portainer-events-1',
        websocketUrl: '/api/homelab/portainer/terminal/ws?sessionId=portainer-events-1',
        mode: 'portainer-api',
        terminal: 'xterm',
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'events-follow' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Type filter'), { target: { value: 'container' } })
    fireEvent.click(dialog.getByRole('button', { name: 'events-follow' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/terminal/session',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '3',
          action: 'events-follow',
          args: expect.objectContaining({
            since: expect.any(Number),
            type: 'container',
          }),
        }),
      ),
    )
    expect(await screen.findByRole('dialog', { name: 'Portainer terminal' })).toBeInTheDocument()
    expect(screen.getByTestId('portainer-xterm-terminal')).toBeInTheDocument()
    await waitFor(() => expect(socketInstances[0]?.url).toContain('/api/homelab/portainer/terminal/ws?sessionId=portainer-events-1'))
  })

  it('shows Docker container process output through the Portainer gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        response: {
          Titles: ['PID', 'USER', 'TIME', 'COMMAND'],
          Processes: [['1', 'root', '00:00:01', 'nginx: master process']],
        },
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('Containers 1'))
    fireEvent.click(screen.getAllByText('nginx').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getAllByRole('button', { name: 'processes' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'processes',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx' }),
        }),
      ),
    )
    expect(screen.getByText(/nginx: master process/)).toBeInTheDocument()
  })

  it('shows Docker container filesystem changes through the Portainer gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        response: [{ Path: '/etc/nginx/nginx.conf', Kind: 0 }],
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('Containers 1'))
    fireEvent.click(screen.getAllByText('nginx').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getAllByRole('button', { name: 'changes' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'changes',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx' }),
        }),
      ),
    )
    expect(screen.getAllByText(/nginx.conf/).length).toBeGreaterThan(0)
  })

  it('shows Docker asset inspect output through the Portainer gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          response: { Id: 'sha256:image', RepoTags: ['nginx:latest'] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          response: { Name: 'nginx_data', Driver: 'local' },
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('Images 1'))
    fireEvent.click(screen.getAllByText('nginx:latest').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getByRole('button', { name: 'inspect-image' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'image',
          resourceId: 'sha256:image',
          action: 'inspect-image',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx:latest' }),
        }),
      ),
    )
    expect(screen.getByText(/RepoTags/)).toBeInTheDocument()
    let closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1]!)

    fireEvent.click(screen.getByText('Volumes 1'))
    fireEvent.click(screen.getAllByText('nginx_data').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getByRole('button', { name: 'inspect-volume' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'volume',
          resourceId: 'vol1',
          action: 'inspect-volume',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx_data' }),
        }),
      ),
    )
    expect(screen.getByText(/"Driver": "local"/)).toBeInTheDocument()
  })

  it('runs Portainer Swarm service log actions through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        response: { logs: 'web-service.1 started\n' },
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('web-service'))
    expect(screen.getByRole('button', { name: 'inspect-service' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'service-logs' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'swarm-service',
          resourceId: 'svc123456789',
          action: 'service-logs',
          args: expect.objectContaining({ endpoint_id: 3, name: 'web-service' }),
        }),
      ),
    )
    expect(screen.getByText(/web-service.1 started/)).toBeInTheDocument()
  })

  it('runs Portainer Swarm service scale and node availability updates through the gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'scale-service',
          response: {},
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'update-node-availability',
          response: {},
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('web-service'))
    fireEvent.click(screen.getByRole('button', { name: 'scale-service' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Replicas'), { target: { value: '4' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'scale-service' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'swarm-service',
          resourceId: 'svc123456789',
          action: 'scale-service',
          args: expect.objectContaining({ endpoint_id: 3, name: 'web-service', replicas: 4 }),
        }),
      ),
    )

    fireEvent.click(screen.getByText('swarm-manager'))
    fireEvent.click(screen.getByRole('button', { name: 'update-node-availability' }))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Availability'), { target: { value: 'drain' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-node-availability' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'swarm-node',
          resourceId: 'node123456789',
          action: 'update-node-availability',
          args: expect.objectContaining({ endpoint_id: 3, name: 'swarm-manager', availability: 'drain' }),
        }),
      ),
    )
  })

  it('creates and updates Portainer Swarm services through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'create-service',
          response: { ID: 'new-service' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'update-service',
          response: {},
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'rollback-service',
          response: {},
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByRole('button', { name: 'create-service' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Service name'), { target: { value: 'api-service' } })
    fireEvent.change(within(dialog).getByLabelText('Image'), { target: { value: 'ghcr.io/example/api:1' } })
    fireEvent.change(within(dialog).getByLabelText('Replicas'), { target: { value: '2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-service' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '3',
          action: 'create-service',
          args: expect.objectContaining({
            name: 'api-service',
            image: 'ghcr.io/example/api:1',
            replicas: 2,
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByText('web-service'))
    fireEvent.click(screen.getByRole('button', { name: 'update-service' }))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Image'), { target: { value: 'nginx:1.27' } })
    fireEvent.change(within(dialog).getByLabelText('Replicas'), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-service' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'swarm-service',
          resourceId: 'svc123456789',
          action: 'update-service',
          args: expect.objectContaining({
            endpoint_id: 3,
            name: 'web-service',
            image: 'nginx:1.27',
            replicas: 3,
          }),
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'rollback-service' }))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type target to confirm'), { target: { value: 'web-service' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'rollback-service' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'swarm-service',
          resourceId: 'svc123456789',
          action: 'rollback-service',
          args: expect.objectContaining({ endpoint_id: 3, name: 'web-service' }),
          confirmation: 'web-service',
        }),
      ),
    )
  })

  it('runs Portainer Kubernetes resource actions through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'kubernetes-pod-logs',
          response: { logs: 'api-deployment-7d9c started\n' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'delete-kubernetes-pod',
          response: {},
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('api-deployment'))
    expect(screen.getByRole('button', { name: 'inspect-kubernetes-application' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delete-kubernetes-application' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('api-deployment-7d9c'))
    expect(screen.getByRole('button', { name: 'inspect-kubernetes-pod' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'kubernetes-pod-exec' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'kubernetes-pod-logs' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'kubernetes-pod',
          resourceId: 'api-deployment-7d9c',
          action: 'kubernetes-pod-logs',
          args: expect.objectContaining({ endpoint_id: 6, name: 'api-deployment-7d9c', namespace: 'apps' }),
        }),
      ),
    )
    expect(screen.getByText(/api-deployment-7d9c started/)).toBeInTheDocument()
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1]!)

    fireEvent.click(screen.getByRole('button', { name: 'delete-kubernetes-pod' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type target to confirm'), { target: { value: 'api-deployment-7d9c' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete-kubernetes-pod' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'kubernetes-pod',
          resourceId: 'api-deployment-7d9c',
          action: 'delete-kubernetes-pod',
          args: expect.objectContaining({ endpoint_id: 6, name: 'api-deployment-7d9c', namespace: 'apps' }),
          confirmation: 'api-deployment-7d9c',
        }),
      ),
    )
  })

  it('deploys Kubernetes manifests through the dedicated CodeMirror gateway editor', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        action: 'preview-kubernetes-manifest',
        response: {
          strategy: 'upsert',
          resources: [
            {
              kind: 'Namespace',
              name: 'apps',
              resourcePath: '/endpoints/6/kubernetes/api/v1/namespaces/apps',
              diff: { exists: true, diffStatus: 'replace', changeCount: 1, changedPaths: ['/metadata/labels/app'] },
            },
          ],
        },
      },
    }).mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        action: 'apply-kubernetes-manifest',
        response: { applied: 1 },
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('k8s-prod'))
    fireEvent.click(screen.getByRole('button', { name: 'apply-kubernetes-manifest' }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Deploy Kubernetes manifest' })).toBeInTheDocument())
    expect(screen.getByTestId('portainer-manifest-codemirror')).toBeInTheDocument()
    expect(screen.getByLabelText('Apply strategy')).toHaveValue('upsert')
    fireEvent.click(screen.getByRole('button', { name: 'Preview Manifest' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '6',
          action: 'preview-kubernetes-manifest',
          args: expect.objectContaining({
            namespace: 'default',
            apply_strategy: 'upsert',
            manifest: expect.stringContaining('kind: Namespace'),
          }),
        }),
      ),
    )
    expect(screen.getByText('Manifest preview')).toBeInTheDocument()
    expect(screen.getByText('Namespace/apps')).toBeInTheDocument()
    expect(screen.getByText(/replace \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('/metadata/labels/app')).toBeInTheDocument()
    expect(screen.getByText('/endpoints/6/kubernetes/api/v1/namespaces/apps')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Deploy Manifest' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '6',
          action: 'apply-kubernetes-manifest',
          args: expect.objectContaining({
            namespace: 'default',
            apply_strategy: 'upsert',
            manifest: expect.stringContaining('kind: Namespace'),
          }),
        }),
      ),
    )
  })

  it('creates Kubernetes application manifests through typed Portainer gateway forms', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'portainer-api',
        action: 'create-kubernetes-application',
        response: { applied: 1 },
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('k8s-prod'))
    fireEvent.click(screen.getByRole('button', { name: 'create-kubernetes-application' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Application name'), { target: { value: 'worker' } })
    fireEvent.change(within(dialog).getByLabelText('Namespace'), { target: { value: 'apps' } })
    fireEvent.change(within(dialog).getByLabelText('Image'), { target: { value: 'ghcr.io/example/worker:1' } })
    fireEvent.change(within(dialog).getByLabelText('Replicas'), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText('Container port'), { target: { value: '8080' } })
    fireEvent.change(within(dialog).getByLabelText('Labels'), { target: { value: 'tier=backend' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-kubernetes-application' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '6',
          action: 'create-kubernetes-application',
          args: expect.objectContaining({
            name: 'worker',
            namespace: 'apps',
            image: 'ghcr.io/example/worker:1',
            replicas: 3,
            port: 8080,
            labels: 'tier=backend',
          }),
        }),
      ),
    )
  })

  it('runs Portainer Helm release controls through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'install-helm-chart',
          response: { dryRun: true },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'helm-release-history',
          response: [{ revision: 1 }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'rollback-helm-release',
          response: {},
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'uninstall-helm-release',
          response: {},
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('k8s-prod'))
    fireEvent.click(screen.getByRole('button', { name: 'install-helm-chart' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Release name'), { target: { value: 'helm-api' } })
    fireEvent.change(within(dialog).getByLabelText('Namespace'), { target: { value: 'apps' } })
    fireEvent.change(within(dialog).getByLabelText('Repository URL'), { target: { value: 'https://charts.bitnami.com/bitnami' } })
    fireEvent.change(within(dialog).getByLabelText('Chart'), { target: { value: 'bitnami/nginx' } })
    fireEvent.change(within(dialog).getByLabelText('Version'), { target: { value: '15.0.0' } })
    fireEvent.change(within(dialog).getByLabelText('Values YAML'), { target: { value: 'replicaCount: 2\n' } })
    fireEvent.click(within(dialog).getByLabelText('Dry run'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'install-helm-chart' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '6',
          action: 'install-helm-chart',
          args: expect.objectContaining({
            name: 'helm-api',
            namespace: 'apps',
            repo: 'https://charts.bitnami.com/bitnami',
            chart: 'bitnami/nginx',
            version: '15.0.0',
            values: 'replicaCount: 2\n',
            atomic: true,
            dry_run: true,
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('Helm Releases 1'))
    fireEvent.click(screen.getAllByRole('button', { name: 'nginx' }).at(-1)!)
    expect(screen.getAllByRole('button', { name: 'inspect-helm-release' }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'helm-release-history' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'helm-release',
          resourceId: 'nginx',
          action: 'helm-release-history',
          args: expect.objectContaining({ endpoint_id: 6, name: 'nginx', namespace: 'apps' }),
        }),
      ),
    )
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1]!)

    fireEvent.click(screen.getAllByRole('button', { name: 'rollback-helm-release' })[0]!)
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Revision'), { target: { value: '1' } })
    fireEvent.change(within(dialog).getByLabelText('Type target to confirm'), { target: { value: 'nginx' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'rollback-helm-release' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'helm-release',
          resourceId: 'nginx',
          action: 'rollback-helm-release',
          args: expect.objectContaining({ endpoint_id: 6, name: 'nginx', namespace: 'apps', revision: 1, wait: true }),
          confirmation: 'nginx',
        }),
      ),
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'uninstall-helm-release' })[0]!)
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type target to confirm'), { target: { value: 'nginx' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'uninstall-helm-release' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'helm-release',
          resourceId: 'nginx',
          action: 'uninstall-helm-release',
          args: expect.objectContaining({ endpoint_id: 6, name: 'nginx', namespace: 'apps' }),
          confirmation: 'nginx',
        }),
      ),
    )
  })

  it('runs Portainer ACI container group controls through the dedicated gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'create-aci-container-group',
          response: { name: 'api-aci' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'inspect-aci-container-group',
          response: { name: 'web-aci', properties: { instanceView: { state: 'Running' } } },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'portainer-api',
          action: 'delete-aci-container-group',
          response: {},
        },
      })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getAllByText('aci-prod').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getByRole('button', { name: 'create-aci-container-group' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Subscription ID'), { target: { value: 'sub-1' } })
    fireEvent.change(within(dialog).getByLabelText('Resource group'), { target: { value: 'rg-prod' } })
    fireEvent.change(within(dialog).getByLabelText('Container group name'), { target: { value: 'api-aci' } })
    fireEvent.change(within(dialog).getByLabelText('Location'), { target: { value: 'eastus' } })
    fireEvent.change(within(dialog).getByLabelText('Image'), { target: { value: 'ghcr.io/example/api:1' } })
    fireEvent.change(within(dialog).getByLabelText('CPU'), { target: { value: '2' } })
    fireEvent.change(within(dialog).getByLabelText('Memory GB'), { target: { value: '4' } })
    fireEvent.change(within(dialog).getByLabelText('Ports'), { target: { value: '443:8443/tcp' } })
    fireEvent.change(within(dialog).getByLabelText('Environment'), { target: { value: 'APP_ENV=production' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-aci-container-group' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '9',
          action: 'create-aci-container-group',
          args: expect.objectContaining({
            subscription_id: 'sub-1',
            resource_group: 'rg-prod',
            name: 'api-aci',
            location: 'eastus',
            image: 'ghcr.io/example/api:1',
            os: 'Linux',
            cpu: 2,
            memory: 4,
            ports: '443:8443/tcp',
            env: 'APP_ENV=production',
            allocate_public_ip: true,
          }),
        }),
      ),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('ACI Container Groups 1'))
    fireEvent.click(screen.getAllByText('web-aci').map(element => element.closest('button')).find(Boolean)!)
    fireEvent.click(screen.getAllByRole('button', { name: 'inspect-aci-container-group' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'aci-container-group',
          resourceId: '/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci',
          action: 'inspect-aci-container-group',
          args: expect.objectContaining({ endpoint_id: 9, name: 'web-aci' }),
        }),
      ),
    )
    expect(screen.getByText(/"state": "Running"/)).toBeInTheDocument()
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1]!)

    fireEvent.click(screen.getAllByRole('button', { name: 'delete-aci-container-group' })[0]!)
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type target to confirm'), { target: { value: 'web-aci' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'delete-aci-container-group' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/action',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'aci-container-group',
          resourceId: '/subscriptions/sub-1/resourceGroups/rg-prod/providers/Microsoft.ContainerInstance/containerGroups/web-aci',
          action: 'delete-aci-container-group',
          args: expect.objectContaining({ endpoint_id: 9, name: 'web-aci' }),
          confirmation: 'web-aci',
        }),
      ),
    )
  })

  it('opens Portainer container logs through an xterm terminal websocket session', async () => {
    homelabData = homelabFixture()
    const socketInstances: Array<{ url: string; close: () => void; onopen: (() => void) | null; onmessage: ((event: { data: string }) => void) | null }> = []
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      binaryType = ''
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      constructor(public url: string) {
        socketInstances.push(this)
        setTimeout(() => this.onopen?.(), 0)
      }
      send() {}
      close() {
        this.onclose?.()
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      observe() {}
      disconnect() {}
    })
    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'portainer-logs-1',
        websocketUrl: '/api/homelab/portainer/terminal/ws?sessionId=portainer-logs-1',
        mode: 'portainer-api',
        terminal: 'xterm',
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getAllByText('nginx').find(element => element.tagName === 'BUTTON')!)
    fireEvent.click(screen.getAllByRole('button', { name: 'logs' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/terminal/session',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'logs',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx' }),
        }),
      ),
    )
    expect(await screen.findByRole('dialog', { name: 'Portainer terminal' })).toBeInTheDocument()
    expect(screen.getByTestId('portainer-xterm-terminal')).toBeInTheDocument()
    await waitFor(() => expect(socketInstances[0]?.url).toContain('/api/homelab/portainer/terminal/ws?sessionId=portainer-logs-1'))
  })

  it('opens Portainer container exec through the xterm terminal session endpoint', async () => {
    homelabData = homelabFixture()
    const socketInstances: Array<{ url: string; close: () => void; onopen: (() => void) | null; sent: string[] }> = []
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      binaryType = ''
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      sent: string[] = []
      constructor(public url: string) {
        socketInstances.push(this)
        setTimeout(() => this.onopen?.(), 0)
      }
      send(data: string) {
        this.sent.push(data)
      }
      close() {
        this.onclose?.()
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      observe() {}
      disconnect() {}
    })
    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'portainer-exec-1',
        websocketUrl: '/api/homelab/portainer/terminal/ws?sessionId=portainer-exec-1',
        mode: 'portainer-api',
        terminal: 'xterm',
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getAllByText('nginx').find(element => element.tagName === 'BUTTON')!)
    fireEvent.click(screen.getByRole('button', { name: 'exec' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Command'), { target: { value: 'whoami' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'exec' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/terminal/session',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'exec',
          args: expect.objectContaining({ endpoint_id: 3, name: 'nginx', command: 'whoami' }),
        }),
      ),
    )
    expect(await screen.findByRole('dialog', { name: 'Portainer terminal' })).toBeInTheDocument()
    await waitFor(() => expect(socketInstances[0]?.url).toContain('/api/homelab/portainer/terminal/ws?sessionId=portainer-exec-1'))
    await waitFor(() => expect(xtermDataHandlers.length).toBeGreaterThan(0))
    act(() => xtermDataHandlers[0]?.('ls -la\n'))
    expect(socketInstances[0]?.sent).toContain('ls -la\n')
  })

  it('opens Portainer Kubernetes pod exec through the xterm terminal session endpoint', async () => {
    homelabData = homelabFixture()
    const socketInstances: Array<{ url: string; close: () => void; onopen: (() => void) | null; sent: string[] }> = []
    class MockWebSocket {
      static OPEN = 1
      readyState = MockWebSocket.OPEN
      binaryType = ''
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      sent: string[] = []
      constructor(public url: string) {
        socketInstances.push(this)
        setTimeout(() => this.onopen?.(), 0)
      }
      send(data: string) {
        this.sent.push(data)
      }
      close() {
        this.onclose?.()
      }
    }
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('ResizeObserver', class MockResizeObserver {
      observe() {}
      disconnect() {}
    })
    apiPostMock.mockResolvedValueOnce({
      data: {
        sessionId: 'portainer-kube-exec-1',
        websocketUrl: '/api/homelab/portainer/terminal/ws?sessionId=portainer-kube-exec-1',
        mode: 'portainer-api',
        terminal: 'xterm',
      },
    })
    const PortainerModule = (await import('../PortainerModule')).default
    render(<PortainerModule />)

    fireEvent.click(screen.getByRole('button', { name: /Operations/ }))
    fireEvent.click(screen.getByText('api-deployment-7d9c'))
    fireEvent.click(screen.getByRole('button', { name: 'kubernetes-pod-exec' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Command'), { target: { value: 'whoami' } })
    fireEvent.change(within(dialog).getByLabelText('Container name'), { target: { value: 'api' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'kubernetes-pod-exec' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/portainer/terminal/session',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'kubernetes-pod',
          resourceId: 'api-deployment-7d9c',
          action: 'kubernetes-pod-exec',
          args: expect.objectContaining({ endpoint_id: 6, namespace: 'apps', name: 'api-deployment-7d9c', command: 'whoami', container: 'api' }),
        }),
      ),
    )
    expect(await screen.findByRole('dialog', { name: 'Portainer terminal' })).toBeInTheDocument()
    await waitFor(() => expect(socketInstances[0]?.url).toContain('/api/homelab/portainer/terminal/ws?sessionId=portainer-kube-exec-1'))
  })

  it('shows Proxmox UPID task status after a core VM action', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'proxmox-api',
        action: 'set-memory',
        target: { node: 'pve', kind: 'qemu', vmid: 100 },
        response: { data: 'UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:' },
        task: {
          upid: 'UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:',
          node: 'pve',
          status: { status: 'running', type: 'qmconfig', id: '100' },
        },
      },
    })
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    render(<ProxmoxModule />)

    fireEvent.click(screen.getByText('100 (infra-vm)'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Set Memory' })[0]!)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set Memory' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'proxmox',
          resourceType: 'vm',
          resourceId: '100',
          action: 'set-memory',
          args: expect.objectContaining({ memory_mb: 4096 }),
        }),
      ),
    )
    await waitFor(() => expect(screen.getByText(/Task UPID:/)).toBeInTheDocument())
    expect(screen.getByText(/Task status: running/)).toBeInTheDocument()
    expect(screen.getByText(/Task type: qmconfig/)).toBeInTheDocument()
  })

  it('keeps recent Proxmox UPID activity visible after selection changes and remounts', async () => {
    const upid = 'UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:'
    homelabData = homelabFixture()
    window.localStorage.removeItem('proxmox-console-task-activity')
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'proxmox-api',
        action: 'set-memory',
        target: { node: 'pve', kind: 'qemu', vmid: 100 },
        response: { data: upid },
        task: {
          upid,
          node: 'pve',
          status: { status: 'running', type: 'qmconfig', id: '100' },
        },
      },
    })
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    render(<ProxmoxModule />)

    fireEvent.click(screen.getByText('100 (infra-vm)'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Set Memory' })[0]!)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set Memory' }))

    await waitFor(() => expect(screen.getByText(/Task UPID:/)).toBeInTheDocument())
    expect(JSON.parse(window.localStorage.getItem('proxmox-console-task-activity') || '[]')).toEqual([
      expect.objectContaining({ upid, node: 'pve', status: 'running' }),
    ])

    fireEvent.click(screen.getAllByText('pve')[0]!)
    expect(screen.getByText('1 tracked')).toBeInTheDocument()
    expect(screen.getByText(/Task UPID:/)).toBeInTheDocument()

    cleanup()
    render(<ProxmoxModule />)
    expect(screen.getByText('1 tracked')).toBeInTheDocument()
    expect(screen.getByText(/Task UPID:/)).toBeInTheDocument()
  })

  it('polls Proxmox task status after a UPID-returning VM action', async () => {
    vi.useFakeTimers()
    const upid = 'UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmconfig:100:root@pam:'
    homelabData = homelabFixture()
    apiPostMock
      .mockResolvedValueOnce({
        data: {
          mode: 'proxmox-api',
          action: 'set-memory',
          target: { node: 'pve', kind: 'qemu', vmid: 100 },
          response: { data: upid },
          task: {
            upid,
            node: 'pve',
            status: { status: 'running', type: 'qmconfig', id: '100' },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          mode: 'proxmox-api',
          action: 'task-status',
          target: { node: 'pve', upid },
          response: { data: { status: 'stopped', type: 'qmconfig', id: '100', exitstatus: 'OK' } },
        },
      })
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    render(<ProxmoxModule />)

    fireEvent.click(screen.getByText('100 (infra-vm)'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Set Memory' })[0]!)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set Memory' }))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/Task status: running/)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2500)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiPostMock).toHaveBeenCalledWith(
      '/api/homelab/control',
      expect.objectContaining({
        provider: 'proxmox',
        resourceType: 'task',
        resourceId: upid,
        action: 'task-status',
        args: expect.objectContaining({ node: 'pve', name: upid }),
      }),
    )
    expect(screen.getByText(/Poll 1: stopped/)).toBeInTheDocument()
    expect(screen.getByText(/Exit status: OK/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('proxmox-console-task-activity') || '[]')).toEqual([
      expect.objectContaining({ upid, node: 'pve', status: 'stopped' }),
    ])
  })

  it('fetches real Proxmox task log/status from the selected task tabs', async () => {
    const upid = 'UPID:pve:000EE18B:1D8D45C5:6A0FB5F3:qmstart:100:root@pam:'
    homelabData = {
      ...homelabFixture(),
      proxmox: {
        ...homelabFixture().proxmox,
        tasks: [{
          node: 'pve',
          upid,
          id: '100',
          user: 'root@pam',
          task_type: 'qmstart',
          status: 'running',
          starttime: 1779410000,
          endtime: 0,
        }],
      },
    }
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'proxmox-api',
        action: 'task-log',
        target: { node: 'pve', upid },
        response: { data: [{ n: 1, t: 'starting VM 100' }, { n: 2, t: 'OK' }] },
      },
    })
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    render(<ProxmoxModule />)

    const taskCell = screen.getAllByText('qmstart')[0]!
    fireEvent.doubleClick(taskCell.closest('tr')!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Log' })[0]!)

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'proxmox',
          resourceType: 'task',
          resourceId: upid,
          action: 'task-log',
          args: expect.objectContaining({ node: 'pve', name: '100' }),
        }),
      ),
    )
    expect(await screen.findByText(/1: starting VM 100/)).toBeInTheDocument()
    expect(screen.getByText(/2: OK/)).toBeInTheDocument()
  })

  it('renders provider diagnostics for configured offline providers', async () => {
    homelabData = {
      ...homelabFixture(),
      live: { proxmox: false, opnsense: true, portainer: true, docker: true },
      diagnostics: {
        providers: [
          {
            provider: 'proxmox',
            status: 'offline',
            severity: 'error',
            configured: true,
            message: 'Proxmox is configured but neither API nor SSH fallback returned live data.',
          },
        ],
      },
    }
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/audit-log?resource_type=homelab_control&limit=12') {
        return {
          data: [
            {
              id: 7,
              action: 'homelab_control',
              resource_type: 'homelab',
              resource_id: 'stack-42',
              created_at: '2026-05-13T04:00:00Z',
              details: {
                provider: 'portainer',
                resource_type: 'stack',
                resource_id: 'stack-42',
                action: 'delete',
                destructive: true,
                confirmation_supplied: true,
                target_name: 'old-stack',
              },
            },
          ],
        }
      }
      return null
    })
    const ActivitySettingsModule = (await import('../ActivitySettingsModule')).default

    render(<ActivitySettingsModule />)

    expect(screen.getByText('Provider Diagnostics')).toBeInTheDocument()
    expect(screen.getByText('proxmox')).toBeInTheDocument()
    expect(screen.getAllByText('offline').length).toBeGreaterThan(0)
    expect(screen.getByText(/neither API nor SSH fallback/)).toBeInTheDocument()
    expect(await screen.findByText('Recent Control Audit')).toBeInTheDocument()
    expect(screen.getByText('delete old-stack')).toBeInTheDocument()
    expect(screen.getByText('confirmed')).toBeInTheDocument()
  })

  it('sends OPNsense service controls through the HomeLab gateway', async () => {
    homelabData = homelabFixture()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Network')
    fireEvent.click(screen.getByText('restart'))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'opnsense',
          resourceType: 'service',
          resourceId: 'unbound',
          action: 'restart',
        }),
      ),
    )
  })

  it('renders OPNsense network inventory beyond service status', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Network')
    expect(screen.getByText('Interfaces and Gateways')).toBeInTheDocument()
    expect(screen.getAllByText('WAN').length).toBeGreaterThan(0)
    expect(screen.getByText('WAN_DHCP')).toBeInTheDocument()
    expect(screen.getByText('DHCP, DNS, and Firewall')).toBeInTheDocument()
    expect(screen.getAllByText('running').length).toBeGreaterThan(0)
  })

  it('sends generic system controls through the HomeLab gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Services')
    fireEvent.click(screen.getByText('healthcheck'))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'system',
          resourceType: 'system',
          resourceId: 'host-services',
          action: 'healthcheck',
        }),
      ),
    )
  })

  it('opens generic system URLs returned by the backend gateway', async () => {
    homelabData = homelabFixture()
    apiPostMock.mockResolvedValueOnce({
      data: {
        mode: 'homelab-system',
        response: { url: 'http://127.0.0.1:8077' },
      },
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Services')
    fireEvent.click(screen.getByText('open'))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'system',
          resourceType: 'system',
          resourceId: 'host-services',
          action: 'open',
        }),
      ),
    )
    expect(openSpy).toHaveBeenCalledWith('http://127.0.0.1:8077', '_blank', 'noopener,noreferrer')
  })

  it('sends typed confirmation for destructive Portainer actions', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getAllByText('remove')[0])
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByPlaceholderText('nginx'), { target: { value: 'nginx' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'remove' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'remove',
          confirmation: 'nginx',
        }),
      ),
    )
  })

  it('duplicates Portainer containers with a new name', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('duplicate'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Duplicate name'), { target: { value: 'nginx-copy' } })
    fireEvent.click(within(dialog).getByLabelText('Start after duplicate'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'duplicate' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'container',
          resourceId: 'abc123',
          action: 'duplicate',
          args: expect.objectContaining({
            new_name: 'nginx-copy',
            start: false,
          }),
        }),
      ),
    )
  })

  it('does not mutate when simple confirmation is cancelled', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('restart'))

    expect(screen.getByRole('dialog')).toHaveTextContent('Confirm action')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(apiPostMock).not.toHaveBeenCalled()
  })

  it('creates stacks through the compose drawer payload', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('create-stack'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Stack name'), { target: { value: 'new-stack' } })
    fireEvent.change(within(dialog).getByLabelText('Compose YAML'), {
      target: { value: 'services:\n  app:\n    image: nginx:latest\n' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-stack' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          resourceType: 'endpoint',
          resourceId: '3',
          action: 'create-stack',
          args: expect.objectContaining({
            name: 'new-stack',
            stack_file_content: 'services:\n  app:\n    image: nginx:latest\n',
          }),
        }),
      ),
    )
  })

  it('sends Portainer registry controls through the gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('create-registry'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'new-registry' } })
    fireEvent.change(within(dialog).getByLabelText('URL'), { target: { value: 'registry.local' } })
    fireEvent.change(within(dialog).getByLabelText('Type'), { target: { value: '3' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-registry' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'registry',
          action: 'create-registry',
          args: expect.objectContaining({
            name: 'new-registry',
            url: 'registry.local',
            type: 3,
            authentication: false,
          }),
        }),
      ),
    )
  })

  it('sends Portainer user and team controls through the gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('create-user'))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: 'operator' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'change-me' } })
    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-user' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'user',
          action: 'create-user',
          args: expect.objectContaining({
            username: 'operator',
            password: 'change-me',
            role: '1',
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('Teams 1'))
    fireEvent.click(screen.getByText('update-team'))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'platform-ops' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-team' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'team',
          resourceId: '9',
          action: 'update-team',
          args: expect.objectContaining({
            name: 'platform-ops',
          }),
        }),
      ),
    )
  })

  it('sends Portainer endpoint group and tag controls through the gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('create-endpoint-group'))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'staging' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-endpoint-group' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'endpoint-group',
          action: 'create-endpoint-group',
          args: expect.objectContaining({
            name: 'staging',
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('Tags 2'))
    fireEvent.click(screen.getByText('update-tag'))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'edge-prod' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-tag' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'tag',
          resourceId: '1',
          action: 'update-tag',
          args: expect.objectContaining({
            name: 'edge-prod',
          }),
        }),
      ),
    )
  })

  it('sends Portainer settings controls through the gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('inspect-settings'))
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'settings',
          resourceId: 'services',
          action: 'inspect-settings',
        }),
      ),
    )

    fireEvent.click(screen.getByText('update-settings'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Edge agent check-in interval'), { target: { value: '10' } })
    fireEvent.change(within(dialog).getByLabelText('Enable telemetry'), { target: { value: 'false' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-settings' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'settings',
          resourceId: 'services',
          action: 'update-settings',
          args: expect.objectContaining({
            edge_agent_checkin_interval: 10,
            enable_telemetry: 'false',
          }),
        }),
      ),
    )
  })

  it('sends Portainer template controls through the gateway', async () => {
    homelabData = homelabFixture()
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('App Templates 1'))
    fireEvent.click(screen.getByText('app-template-file'))
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'app-template',
          resourceId: '21',
          action: 'app-template-file',
        }),
      ),
    )

    fireEvent.click(screen.getByText('deploy-app-template'))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Endpoint ID'), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText('Deployment name'), { target: { value: 'redis-app' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'deploy-app-template' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'app-template',
          resourceId: '21',
          action: 'deploy-app-template',
          args: expect.objectContaining({
            endpoint_id: 3,
            name: 'redis-app',
            image: 'redis:7',
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('Custom Templates 1'))
    fireEvent.click(screen.getByText('custom-template-file'))
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'custom-template',
          resourceId: '12',
          action: 'custom-template-file',
        }),
      ),
    )

    fireEvent.click(screen.getByText('deploy-custom-template'))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Endpoint ID'), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText('Stack name'), { target: { value: 'nginx-from-template' } })
    fireEvent.change(within(dialog).getByLabelText('Swarm ID'), { target: { value: 'swarm123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'deploy-custom-template' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'custom-template',
          resourceId: '12',
          action: 'deploy-custom-template',
          args: expect.objectContaining({
            endpoint_id: 3,
            name: 'nginx-from-template',
            stack_kind: 'swarm',
            swarm_id: 'swarm123',
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('create-custom-template'))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'compose template' } })
    fireEvent.change(within(dialog).getByLabelText('Stack file content'), { target: { value: 'services:\n  web:\n    image: nginx:latest\n' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'create-custom-template' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'custom-template',
          action: 'create-custom-template',
          args: expect.objectContaining({
            title: 'compose template',
            type: '2',
            platform: '1',
            file_content: 'services:\n  web:\n    image: nginx:latest\n',
          }),
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByText('update-custom-template'))
    dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'nginx template v2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'update-custom-template' }))

    await waitFor(() =>
      expect(apiPostMock).toHaveBeenCalledWith(
        '/api/homelab/control',
        expect.objectContaining({
          provider: 'portainer',
          instanceId: 'services',
          resourceType: 'custom-template',
          resourceId: '12',
          action: 'update-custom-template',
          args: expect.objectContaining({
            title: 'nginx template v2',
          }),
        }),
      ),
    )
  })

  it('shows API errors and disables controls while an action is busy', async () => {
    homelabData = homelabFixture()
    let rejectPost: (error: Error) => void = () => undefined
    apiPostMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectPost = reject
      }),
    )
    const mod = await import('../../HomeLab')
    const HomeLab = mod.default
    render(<HomeLab />)

    clickModuleButton('Portainer')
    fireEvent.click(screen.getByText('restart'))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'restart' }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Running...' })).toBeDisabled())

    rejectPost(new Error('Portainer exploded'))
    await waitFor(() => expect(screen.getByText('Control failed: Portainer exploded')).toBeInTheDocument())
  })
})
