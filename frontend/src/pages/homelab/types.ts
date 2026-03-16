export interface VMInfo {
  name: string
  status: string
  cpu: number
  mem: number
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
}

export interface OPNsenseData {
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
  wan_in: string
  wan_out: string
}

export interface HomelabData {
  proxmox: ProxmoxData
  opnsense: OPNsenseData
  mock?: boolean
}
