export interface VMInfo {
  vmid?: number
  name: string
  node?: string
  status: string
  cpu: number
  mem: number
  maxmem?: number
  kind?: 'qemu' | 'lxc' | string
  config?: Record<string, unknown>
  disks?: ProxmoxDiskInfo[]
  networks?: ProxmoxNetworkInfo[]
  snapshots?: ProxmoxSnapshotInfo[]
  firewall_options?: Record<string, unknown>
  firewall_rules?: ProxmoxFirewallRuleInfo[]
}

export interface ProxmoxDiskInfo {
  key: string
  value: string
  storage?: string
  size?: string
}

export interface ProxmoxNetworkInfo {
  key: string
  value: string
  bridge?: string
  model?: string
}

export interface ProxmoxSnapshotInfo {
  name: string
  description?: string
  parent?: string
  snaptime?: number
  vmstate?: boolean
}

export interface ProxmoxFirewallRuleInfo {
  pos?: number
  type?: string
  action?: string
  enable?: number | boolean
  iface?: string
  source?: string
  dest?: string
  proto?: string
  dport?: string
  sport?: string
  comment?: string
  macro?: string
  log?: string
}

export interface NodeInfo {
  name: string
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
}

export interface ProxmoxStorageInfo {
  node: string
  name: string
  storage_type: string
  content: string
  enabled: boolean
  active: boolean
  total: number
  used: number
  avail: number
  shared: boolean
}

export interface ProxmoxBackupInfo {
  node: string
  storage: string
  volid: string
  name: string
  kind: 'qemu' | 'lxc' | string
  vmid?: number
  format: string
  content?: string
  size: number
  ctime: number
  notes: string
  protected: boolean
}

export interface ProxmoxTaskInfo {
  node: string
  upid: string
  id: string
  user: string
  task_type: string
  status: string
  starttime: number
  endtime: number
}

export interface ProxmoxServiceInfo {
  node: string
  id: string
  name: string
  description: string
  state: string
}

export interface ProxmoxHaResourceInfo {
  sid: string
  resource_type: string
  state: string
  group: string
  comment: string
}

export interface ProxmoxData {
  nodes: NodeInfo[]
  vms: VMInfo[]
  storage?: ProxmoxStorageInfo[]
  backups?: ProxmoxBackupInfo[]
  tasks?: ProxmoxTaskInfo[]
  services?: ProxmoxServiceInfo[]
  ha_resources?: ProxmoxHaResourceInfo[]
  source?: 'api' | 'ssh' | string
}

export interface OPNsenseData {
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
  wan_in: string
  wan_out: string
  services?: OPNsenseServiceInfo[]
  interfaces?: Array<Record<string, unknown>>
  gateways?: Array<Record<string, unknown>>
  dhcp?: {
    leases?: Array<Record<string, unknown>>
    total?: number
    interfaces?: unknown
  }
  dns?: {
    unbound_status?: string
    unbound_widget?: Record<string, unknown>
    unbound_totals?: unknown
  }
  firewall?: {
    rules?: Array<Record<string, unknown>>
    rule_total?: number
    aliases?: Array<Record<string, unknown>>
    alias_total?: number
  }
  vpn?: {
    openvpn?: unknown
    wireguard?: unknown
  }
  source?: 'api' | 'ssh' | string
}

export interface OPNsenseServiceInfo {
  id: string
  name: string
  description: string
  running: boolean
  locked?: boolean
}

export interface DockerContainerInfo {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
  host_id?: string
  host_name?: string
  provider?: string
}

export interface DockerData {
  available: boolean
  source: string
  error?: string
  hosts?: DockerHostInfo[]
  instances?: PortainerInstanceInfo[]
  containers: DockerContainerInfo[]
}

export interface DockerHostInfo {
  id: string
  name: string
  host: string
  available: boolean
  error?: string
  containers: DockerContainerInfo[]
}

export interface PortainerEndpointInfo {
  id: number
  name: string
  url?: string
  status?: number
}

export interface PortainerStackInfo {
  id: number
  name: string
  type?: number
  endpoint_id?: number
  instance_id?: string
}

export interface PortainerImageInfo {
  id: string
  name: string
  tags: string[]
  size: number
  created: number
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerVolumeInfo {
  id: string
  name: string
  driver?: string
  mountpoint?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerNetworkInfo {
  id: string
  name: string
  driver?: string
  scope?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerSecretInfo {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerConfigAssetInfo {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerRegistryInfo {
  id: number
  name: string
  url?: string
  type?: number
  authentication?: boolean
  instance_id?: string
}

export interface PortainerInstanceInfo {
  id: string
  name: string
  url: string
  available: boolean
  error?: string
  endpoints: PortainerEndpointInfo[]
  stacks: PortainerStackInfo[]
  containers: DockerContainerInfo[]
  images?: PortainerImageInfo[]
  volumes?: PortainerVolumeInfo[]
  networks?: PortainerNetworkInfo[]
  secrets?: PortainerSecretInfo[]
  configs?: PortainerConfigAssetInfo[]
  registries?: PortainerRegistryInfo[]
}

export interface PortainerData {
  available: boolean
  source: string
  error?: string
  instances: PortainerInstanceInfo[]
  endpoints?: PortainerEndpointInfo[]
  stacks?: PortainerStackInfo[]
  containers: DockerContainerInfo[]
  images?: PortainerImageInfo[]
  volumes?: PortainerVolumeInfo[]
  networks?: PortainerNetworkInfo[]
  secrets?: PortainerSecretInfo[]
  configs?: PortainerConfigAssetInfo[]
  registries?: PortainerRegistryInfo[]
}

export interface HomelabSystemInfo {
  id: string
  name: string
  status: string
  actions: string[]
  primary_url?: string
}

export interface HomelabControlAction {
  provider: string
  resource_type: string
  actions: string[]
}

export interface HomelabControlData {
  actions: HomelabControlAction[]
}

export interface HomelabProviderDiagnostic {
  provider: string
  status: string
  severity: 'info' | 'warn' | 'error' | string
  configured?: boolean
  message: string
}

export interface HomelabDiagnosticsData {
  providers?: HomelabProviderDiagnostic[]
}

export interface HomelabAuditEntry {
  id: number | string
  action: string
  resource_type: string
  resource_id?: string
  created_at: string
  details?: {
    provider?: string
    instance_id?: string | null
    resource_type?: string
    resource_id?: string
    action?: string
    destructive?: boolean
    confirmation_supplied?: boolean
    target_name?: string | null
    endpoint_id?: string | number | null
    node?: string | null
    kind?: string | null
  }
}

export interface HomelabData {
  proxmox: ProxmoxData
  opnsense: OPNsenseData
  docker?: DockerData
  portainer?: PortainerData
  systems?: HomelabSystemInfo[]
  control?: HomelabControlData
  diagnostics?: HomelabDiagnosticsData
  live?: {
    proxmox?: boolean
    opnsense?: boolean
    portainer?: boolean
    docker?: boolean
  }
  mock_services?: {
    proxmox?: boolean
    opnsense?: boolean
  }
  api_configured?: {
    proxmox?: boolean
    opnsense?: boolean
  }
  mock?: boolean
}

export interface HomelabLocalConfig {
  proxmox_host: string
  proxmox_token_id: string
  proxmox_token_secret_set: boolean
  opnsense_host: string
  opnsense_key_set: boolean
  opnsense_secret_set: boolean
  portainer_instances?: PortainerConfigInfo[]
}

export interface PortainerConfigInfo {
  id: string
  name: string
  url: string
  token_set: boolean
}

export interface HomelabConfigData {
  source?: string
  api_configured: {
    proxmox: boolean
    opnsense: boolean
    portainer?: boolean
  }
  local: HomelabLocalConfig
}

export interface ApiSuccess<T> {
  ok: boolean
  data: T
}

export interface HomelabControlInput {
  provider: 'proxmox' | 'portainer' | 'docker-ssh' | 'opnsense' | 'system'
  instanceId?: string
  resourceType: string
  resourceId: string
  action: string
  args?: Record<string, unknown>
  confirmation?: string
}

export interface HomelabControlResult {
  mode: string
  action: string
  target?: unknown
  output?: string
}
