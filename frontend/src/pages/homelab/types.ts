export interface VMInfo {
  vmid?: number
  name: string
  node?: string
  status: string
  cpu: number
  mem: number
  maxmem?: number
  kind?: 'qemu' | 'lxc' | string
}

export interface NodeInfo {
  name: string
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
}

export interface ProxmoxData {
  nodes: NodeInfo[]
  vms: VMInfo[]
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
  source?: 'api' | 'ssh' | string
}

export interface HomelabData {
  proxmox: ProxmoxData
  opnsense: OPNsenseData
  live?: {
    proxmox?: boolean
    opnsense?: boolean
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
}

export interface HomelabConfigData {
  api_configured: {
    proxmox: boolean
    opnsense: boolean
  }
  local: HomelabLocalConfig
}

export interface ApiSuccess<T> {
  ok: boolean
  data: T
}
