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

export interface ProxmoxFirewallAliasInfo {
  name: string
  cidr: string
  comment: string
}

export interface ProxmoxFirewallIpsetInfo {
  name: string
  comment: string
  entries: Array<Record<string, unknown>>
}

export interface ProxmoxFirewallGroupInfo {
  group: string
  comment: string
  rules: ProxmoxFirewallRuleInfo[]
}

export interface ProxmoxFirewallInfo {
  options?: Record<string, unknown>
  rules?: ProxmoxFirewallRuleInfo[]
  aliases?: ProxmoxFirewallAliasInfo[]
  ipsets?: ProxmoxFirewallIpsetInfo[]
  groups?: ProxmoxFirewallGroupInfo[]
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

export interface ProxmoxBackupJobInfo {
  id: string
  enabled: boolean
  schedule: string
  storage: string
  node: string
  vmids: string
  exclude: string
  all: boolean
  mode: string
  compress: string
  mailto: string
  mailnotification: string
  notification_mode: string
  prune_backups: string
  notes_template: string
  comment: string
}

export interface ProxmoxStorageContentInfo {
  node: string
  storage: string
  volid: string
  name: string
  content: string
  subtype: string
  format: string
  vmid?: number
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

export interface ProxmoxHaGroupInfo {
  group: string
  nodes: string
  nofailback: boolean
  restricted: boolean
  comment: string
}

export interface ProxmoxHaStatusInfo {
  id?: string
  type?: string
  node?: string
  status?: string
  state?: string
  quorate?: number | boolean
  [key: string]: unknown
}

export interface ProxmoxReplicationJobInfo {
  id: string
  guest: string
  target: string
  source: string
  schedule: string
  rate: string
  enabled: boolean
  job_type: string
  comment: string
  next_sync: number
  last_sync: number
  last_try: number
  duration: number
  fail_count: number
  error: string
}

export interface ProxmoxPoolInfo {
  poolid: string
  comment: string
  member_count: number
  members: Array<Record<string, unknown>>
}

export interface ProxmoxSdnVnetInfo {
  vnet: string
  zone: string
  alias: string
  tag: string
  vlanaware: boolean
  mtu: string
  pending?: Record<string, unknown>
  raw?: Record<string, unknown>
}

export interface ProxmoxSdnSubnetInfo {
  vnet: string
  subnet: string
  gateway: string
  snat: boolean
  dhcp_range: string
  dnszoneprefix: string
  raw?: Record<string, unknown>
}

export interface ProxmoxSdnInfo {
  status?: Array<Record<string, unknown>>
  controllers?: Array<Record<string, unknown>>
  zones?: Array<Record<string, unknown>>
  vnets?: ProxmoxSdnVnetInfo[]
  subnets?: ProxmoxSdnSubnetInfo[]
  ipams?: Array<Record<string, unknown>>
  dns?: Array<Record<string, unknown>>
  dhcp?: Array<Record<string, unknown>>
}

export interface ProxmoxLogsInfo {
  cluster?: Array<Record<string, unknown>>
  node_syslog?: Array<Record<string, unknown>>
  node_journal?: Array<Record<string, unknown>>
}

export interface ProxmoxAccessUserInfo {
  userid: string
  enabled: boolean
  expire: number
  firstname: string
  lastname: string
  email: string
  comment: string
  groups: string
}

export interface ProxmoxAccessGroupInfo {
  groupid: string
  comment: string
  users: string
}

export interface ProxmoxAccessRoleInfo {
  roleid: string
  privs: string
  special: boolean
}

export interface ProxmoxAccessAclInfo {
  path: string
  ugid: string
  roleid: string
  propagate: boolean
  acl_type: string
}

export interface ProxmoxAccessRealmInfo {
  realm: string
  realm_type: string
  comment: string
  default_realm: boolean
  tfa: string
}

export interface ProxmoxAccessTokenInfo {
  userid: string
  tokenid: string
  comment: string
  expire: number
  privsep: boolean
}

export interface ProxmoxPermissionsInfo {
  users?: ProxmoxAccessUserInfo[]
  groups?: ProxmoxAccessGroupInfo[]
  roles?: ProxmoxAccessRoleInfo[]
  acl?: ProxmoxAccessAclInfo[]
  realms?: ProxmoxAccessRealmInfo[]
  tokens?: ProxmoxAccessTokenInfo[]
}

export interface ProxmoxNodeNetworkInfo {
  node: string
  iface: string
  type: string
  method: string
  method6: string
  cidr: string
  address: string
  netmask: string
  gateway: string
  bridge_ports: string
  active: boolean
  autostart: boolean
  comments: string
}

export interface ProxmoxNodeDnsInfo {
  node: string
  search: string
  dns1: string
  dns2: string
  dns3: string
}

export interface ProxmoxNodeTimeInfo {
  node: string
  timezone: string
  localtime: number
  time: number
}

export interface ProxmoxNodeHostInfo {
  node: string
  content: string
}

export interface ProxmoxNodeRepositoryInfo {
  node: string
  path: string
  file_type: string
  enabled: boolean
  status: string
  suite: string
  component: string
  comment: string
  uri: string
}

export interface ProxmoxData {
  nodes: NodeInfo[]
  vms: VMInfo[]
  storage?: ProxmoxStorageInfo[]
  storage_content?: ProxmoxStorageContentInfo[]
  backups?: ProxmoxBackupInfo[]
  backup_jobs?: ProxmoxBackupJobInfo[]
  replication_jobs?: ProxmoxReplicationJobInfo[]
  pools?: ProxmoxPoolInfo[]
  sdn?: ProxmoxSdnInfo
  logs?: ProxmoxLogsInfo
  tasks?: ProxmoxTaskInfo[]
  services?: ProxmoxServiceInfo[]
  ha_resources?: ProxmoxHaResourceInfo[]
  ha_groups?: ProxmoxHaGroupInfo[]
  ha_status?: ProxmoxHaStatusInfo[]
  permissions?: ProxmoxPermissionsInfo
  firewall?: ProxmoxFirewallInfo
  node_networks?: ProxmoxNodeNetworkInfo[]
  node_dns?: ProxmoxNodeDnsInfo[]
  node_time?: ProxmoxNodeTimeInfo[]
  node_hosts?: ProxmoxNodeHostInfo[]
  node_repositories?: ProxmoxNodeRepositoryInfo[]
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
  created?: number | null
  command?: string | null
  network_names?: string[]
  mount_count?: number | null
  labels?: Record<string, unknown> | null
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

export interface PortainerDockerInfo {
  name?: string | null
  server_version?: string | null
  operating_system?: string | null
  os_type?: string | null
  architecture?: string | null
  cpus?: number | null
  memory_bytes?: number | null
  containers?: number | null
  containers_running?: number | null
  containers_paused?: number | null
  containers_stopped?: number | null
  images?: number | null
  docker_root_dir?: string | null
  driver?: string | null
  swarm_local_node_state?: string | null
  swarm_control_available?: boolean | null
}

export interface PortainerEndpointInfo {
  id: number
  name: string
  url?: string
  status?: number
  type?: number
  platform?: 'docker' | 'kubernetes' | 'aci' | 'unknown' | string
  connection?: string
  group_id?: number
  tags?: number[]
  features?: string[]
  docker_info?: PortainerDockerInfo
}

export interface PortainerCapabilityInfo {
  version?: string | null
  edition?: string
  docker?: boolean
  swarm?: boolean
  kubernetes?: boolean
  aci?: boolean
  groups?: number
  tags?: number
  users?: number
  teams?: number
  app_templates?: number
  custom_templates?: number
  swarm_services?: number
  swarm_nodes?: number
  swarm_tasks?: number
  kubernetes_namespaces?: number
  kubernetes_applications?: number
  kubernetes_pods?: number
  kubernetes_services?: number
  kubernetes_ingresses?: number
  kubernetes_configmaps?: number
  kubernetes_secrets?: number
  kubernetes_volumes?: number
  kubernetes_crds?: number
  kubernetes_helm_releases?: number
  aci_subscriptions?: number
  aci_resource_groups?: number
  aci_container_groups?: number
  settings?: boolean
  system_status?: boolean
}

export interface PortainerAdminTaxonomyInfo {
  id: number | string | null
  name?: string | null
  instance_id?: string
}

export interface PortainerUserInfo {
  id: number | string | null
  username: string
  role?: number | string | null
  teams?: Array<number | string> | string[]
  instance_id?: string
}

export interface PortainerTeamInfo {
  id: number | string | null
  name: string
  instance_id?: string
}

export interface PortainerTemplateInfo {
  id: number | string | null
  title: string
  description?: string
  type?: number | string | null
  platform?: number | string | null
  categories?: string[]
  image?: string | null
  repository?: Record<string, unknown> | null
  instance_id?: string
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
  digests?: string[]
  size: number
  shared_size?: number | null
  virtual_size?: number | null
  containers?: number | null
  labels_count?: number
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
  created_at?: string
  scope?: string
  status?: unknown
  labels_count?: number
  options_count?: number
  usage_ref_count?: number | null
  usage_size?: number | null
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerNetworkInfo {
  id: string
  name: string
  driver?: string
  scope?: string
  created?: string
  ipam?: string
  internal?: boolean
  attachable?: boolean
  ingress?: boolean
  enable_ipv6?: boolean
  containers_count?: number
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

export interface PortainerSwarmServiceInfo {
  id: string
  name: string
  image?: string
  mode?: string
  replicas?: number | null
  created_at?: string
  updated_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerSwarmNodeInfo {
  id: string
  hostname: string
  state?: string
  availability?: string
  role?: string
  manager_reachability?: string
  leader?: boolean
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerSwarmTaskInfo {
  id: string
  service_id?: string
  node_id?: string
  slot?: number | null
  desired_state?: string
  state?: string
  message?: string
  container_id?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesNamespaceInfo {
  id?: string
  name: string
  status?: string
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesApplicationInfo {
  id?: string
  name: string
  namespace?: string
  kind?: string
  ready?: number | null
  replicas?: number | null
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesPodInfo {
  id?: string
  name: string
  namespace?: string
  status?: string
  node?: string
  restart_count?: number
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesServiceInfo {
  id?: string
  name: string
  namespace?: string
  service_type?: string
  cluster_ip?: string
  ports?: unknown[]
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesIngressInfo {
  id?: string
  name: string
  namespace?: string
  hosts?: string
  class_name?: string
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesKeyValueInfo {
  id?: string
  name: string
  namespace?: string
  keys?: number
  secret_type?: string
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesVolumeInfo {
  id?: string
  name: string
  namespace?: string
  kind?: string
  status?: string
  storage_class?: string
  capacity?: string
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerKubernetesCrdInfo {
  id?: string
  name: string
  group?: string
  scope?: string
  kind?: string
  created_at?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerHelmReleaseInfo {
  id?: string
  name: string
  namespace?: string
  chart?: string
  app_version?: string
  revision?: number | string | null
  status?: string
  updated?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerAciSubscriptionInfo {
  id: string
  name?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerAciResourceGroupInfo {
  id?: string
  name: string
  location?: string
  subscription_id?: string
  subscription_name?: string
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerAciContainerGroupInfo {
  id: string
  name: string
  location?: string
  resource_group?: string
  subscription_id?: string
  subscription_name?: string
  status?: string
  os_type?: string
  ip_address?: string
  ip_type?: string
  ports?: unknown[]
  image?: string
  cpu?: number | string | null
  memory_gb?: number | string | null
  env_count?: number
  endpoint_id?: number
  endpoint_name?: string
  instance_id?: string
}

export interface PortainerInstanceInfo {
  id: string
  name: string
  url: string
  available: boolean
  error?: string
  capabilities?: PortainerCapabilityInfo
  groups?: PortainerAdminTaxonomyInfo[]
  tags?: PortainerAdminTaxonomyInfo[]
  users?: PortainerUserInfo[]
  teams?: PortainerTeamInfo[]
  app_templates?: PortainerTemplateInfo[]
  custom_templates?: PortainerTemplateInfo[]
  endpoints: PortainerEndpointInfo[]
  stacks: PortainerStackInfo[]
  containers: DockerContainerInfo[]
  images?: PortainerImageInfo[]
  volumes?: PortainerVolumeInfo[]
  networks?: PortainerNetworkInfo[]
  secrets?: PortainerSecretInfo[]
  configs?: PortainerConfigAssetInfo[]
  swarm_services?: PortainerSwarmServiceInfo[]
  swarm_nodes?: PortainerSwarmNodeInfo[]
  swarm_tasks?: PortainerSwarmTaskInfo[]
  kubernetes_namespaces?: PortainerKubernetesNamespaceInfo[]
  kubernetes_applications?: PortainerKubernetesApplicationInfo[]
  kubernetes_pods?: PortainerKubernetesPodInfo[]
  kubernetes_services?: PortainerKubernetesServiceInfo[]
  kubernetes_ingresses?: PortainerKubernetesIngressInfo[]
  kubernetes_configmaps?: PortainerKubernetesKeyValueInfo[]
  kubernetes_secrets?: PortainerKubernetesKeyValueInfo[]
  kubernetes_volumes?: PortainerKubernetesVolumeInfo[]
  kubernetes_crds?: PortainerKubernetesCrdInfo[]
  kubernetes_helm_releases?: PortainerHelmReleaseInfo[]
  aci_subscriptions?: PortainerAciSubscriptionInfo[]
  aci_resource_groups?: PortainerAciResourceGroupInfo[]
  aci_container_groups?: PortainerAciContainerGroupInfo[]
  registries?: PortainerRegistryInfo[]
}

export interface PortainerData {
  available: boolean
  source: string
  error?: string
  instances: PortainerInstanceInfo[]
  capabilities?: Array<{
    instance_id?: string
    instance_name?: string
    available?: boolean
    capabilities?: PortainerCapabilityInfo
  }>
  groups?: PortainerAdminTaxonomyInfo[]
  tags?: PortainerAdminTaxonomyInfo[]
  users?: PortainerUserInfo[]
  teams?: PortainerTeamInfo[]
  app_templates?: PortainerTemplateInfo[]
  custom_templates?: PortainerTemplateInfo[]
  endpoints?: PortainerEndpointInfo[]
  stacks?: PortainerStackInfo[]
  containers: DockerContainerInfo[]
  images?: PortainerImageInfo[]
  volumes?: PortainerVolumeInfo[]
  networks?: PortainerNetworkInfo[]
  secrets?: PortainerSecretInfo[]
  configs?: PortainerConfigAssetInfo[]
  swarm_services?: PortainerSwarmServiceInfo[]
  swarm_nodes?: PortainerSwarmNodeInfo[]
  swarm_tasks?: PortainerSwarmTaskInfo[]
  kubernetes_namespaces?: PortainerKubernetesNamespaceInfo[]
  kubernetes_applications?: PortainerKubernetesApplicationInfo[]
  kubernetes_pods?: PortainerKubernetesPodInfo[]
  kubernetes_services?: PortainerKubernetesServiceInfo[]
  kubernetes_ingresses?: PortainerKubernetesIngressInfo[]
  kubernetes_configmaps?: PortainerKubernetesKeyValueInfo[]
  kubernetes_secrets?: PortainerKubernetesKeyValueInfo[]
  kubernetes_volumes?: PortainerKubernetesVolumeInfo[]
  kubernetes_crds?: PortainerKubernetesCrdInfo[]
  kubernetes_helm_releases?: PortainerHelmReleaseInfo[]
  aci_subscriptions?: PortainerAciSubscriptionInfo[]
  aci_resource_groups?: PortainerAciResourceGroupInfo[]
  aci_container_groups?: PortainerAciContainerGroupInfo[]
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

export type HomelabCapabilityStatus = 'implemented' | 'external' | 'read_only' | 'blocked' | string

export interface HomelabControlCapability {
  provider: string
  resource_type: string
  action: string
  status: HomelabCapabilityStatus
  surface?: string
  mode?: string
  backend?: string
  embedded?: boolean
  reason?: string
  next?: string
}

export interface HomelabControlData {
  actions: HomelabControlAction[]
  capabilities?: HomelabControlCapability[]
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
  response?: unknown
  task?: unknown
}
