import type { VMInfo } from './types'

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

export function cpuColor(cpu: number): string {
  if (cpu > 0.7) return 'var(--red)'
  if (cpu > 0.5) return 'var(--gold)'
  return 'var(--secondary)'
}

export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id
}

export function normalizeFilter(filter: string): string {
  return filter.trim().toLowerCase()
}

export function matchesQuery(query: string, ...values: Array<string | number | undefined>): boolean {
  if (!query) return true
  return values.some(value =>
    String(value ?? '')
      .toLowerCase()
      .includes(query),
  )
}

export function configValue(config: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = config?.[key]
  if (value === undefined || value === null) return undefined
  return String(value)
}

export function rowValue(row: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value)
  }
  return fallback
}

export function proxmoxGuestMeta(vm: VMInfo): string {
  const disks = vm.disks ?? []
  const networks = vm.networks ?? []
  const snapshots = vm.snapshots ?? []
  const firewallRules = vm.firewall_rules ?? []
  const cores = configValue(vm.config, 'cores') ?? configValue(vm.config, 'cpulimit')
  const memory = configValue(vm.config, 'memory')
  const diskSummary = disks.length
    ? `${disks.length} disks${disks[0].size ? ` (${disks[0].key} ${disks[0].size})` : ''}`
    : 'no disk config'
  const networkSummary = networks.length
    ? `${networks.length} NICs${networks[0].bridge ? ` (${networks[0].bridge})` : ''}`
    : 'no NIC config'
  const firewallEnabled = vm.firewall_options
    ? String(vm.firewall_options.enable ?? vm.firewall_options.enabled ?? '0') === '1' ||
      vm.firewall_options.enable === true ||
      vm.firewall_options.enabled === true
    : false
  return [
    `${vm.kind === 'qemu' ? 'VM' : vm.kind || 'guest'} · ${vm.node || 'node'}`,
    cores ? `${cores} cores` : `CPU ${Math.round(vm.cpu * 100)}%`,
    memory ? `${memory} MiB RAM` : `RAM ${formatBytes(vm.mem)}`,
    diskSummary,
    networkSummary,
    `${snapshots.length} snapshots`,
    firewallEnabled ? 'firewall on' : 'firewall off',
    `${firewallRules.length} firewall rules`,
  ].join(' · ')
}

export function firstSnapshotName(vm: VMInfo): string | undefined {
  return (vm.snapshots ?? []).find(snapshot => snapshot.name && snapshot.name !== 'current')?.name
}

export function firstFirewallRulePos(vm: VMInfo): number | undefined {
  return (vm.firewall_rules ?? []).find(rule => rule.pos !== undefined)?.pos
}
