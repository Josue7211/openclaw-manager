import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ButtonHTMLAttributes } from 'react'

let homelabData: unknown = undefined
const apiGetMock = vi.hoisted(() => vi.fn<(_path: string) => Promise<unknown | null>>(async () => null))
const apiPostMock = vi.hoisted(() =>
  vi.fn(
    async (): Promise<{ data: { mode: string; response?: { url?: string } } }> => ({
      data: { mode: 'portainer-api' },
    }),
  ),
)
const refetchMock = vi.hoisted(() => vi.fn())

vi.mock('@phosphor-icons/react', () => ({
  Desktop: () => <svg data-testid="icon-desktop" />,
}))

vi.mock('@/hooks/useTauriQuery', () => ({
  useTauriQuery: () => ({
    data: homelabData,
    isLoading: false,
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
      services: [],
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
          endpoints: [{ id: 3, name: 'agent-vm', status: 1 }],
          stacks: [{ id: 8, name: 'infra-stack', endpoint_id: 3, instance_id: 'services' }],
          containers: [
            {
              id: 'abc123',
              name: 'nginx',
              image: 'nginx:latest',
              status: 'running',
              state: 'running',
              ports: '0.0.0.0:8080->80/tcp',
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
              size: 100,
              created: 0,
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
      endpoints: [{ id: 3, name: 'agent-vm', status: 1 }],
      stacks: [{ id: 8, name: 'infra-stack', endpoint_id: 3, instance_id: 'services' }],
      containers: [
        {
          id: 'abc123',
          name: 'nginx',
          image: 'nginx:latest',
          status: 'running',
          state: 'running',
          ports: '0.0.0.0:8080->80/tcp',
          endpoint_id: 3,
          endpoint_name: 'agent-vm',
          instance_id: 'services',
          provider: 'portainer',
        },
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
  }
}

function clickModuleButton(label: string) {
  const button = screen.getAllByText(label).find(element => element.tagName === 'BUTTON')
  if (!button) throw new Error(`No module button found for ${label}`)
  fireEvent.click(button)
}

afterEach(() => {
  cleanup()
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
            endpoints: [{ id: 3, name: 'agent-vm', status: 1 }],
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
    expect(screen.getByText('inspect-stack')).toBeInTheDocument()
    expect(screen.getByText('stack-logs')).toBeInTheDocument()
    expect(screen.getByText('start-stack')).toBeInTheDocument()
    expect(screen.getByText('stop-stack')).toBeInTheDocument()
    expect(screen.getByText('create-stack')).toBeInTheDocument()
    expect(screen.getByText('create-secret')).toBeInTheDocument()
    expect(screen.getByText('create-config')).toBeInTheDocument()

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
    homelabData = homelabFixture()
    const ProxmoxModule = (await import('../ProxmoxModule')).default
    const PortainerModule = (await import('../PortainerModule')).default

    const { unmount } = render(<ProxmoxModule />)
    expect(screen.getByText('HomeLab / Proxmox')).toBeInTheDocument()
    expect(screen.getByText('infra-vm')).toBeInTheDocument()
    unmount()

    render(<PortainerModule />)
    expect(screen.getByText('HomeLab / Portainer')).toBeInTheDocument()
    expect(screen.getAllByText('nginx').length).toBeGreaterThan(0)
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
