import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode, DEMO_PROXMOX_VMS, DEMO_PROXMOX_NODES, DEMO_OPNSENSE } from '@/lib/demo-data'
import type { DemoProxmoxVM, DemoProxmoxNode } from '@/lib/demo-data'

const HOMELAB_KEY = ['homelab'] as const

interface ProxmoxNode {
  node: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  memPercent: number
}

interface ProxmoxVM {
  vmid: number
  name: string
  status: string
  cpuPercent: number
  memUsedGB: number
  memTotalGB: number
  node: string
}

interface OPNsenseData {
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
  wan_in: string
  wan_out: string
}

interface HomelabData {
  proxmox: {
    nodes: ProxmoxNode[]
    vms: ProxmoxVM[]
  }
  opnsense: OPNsenseData
}

const DEMO_OPNSENSE_FULL: OPNsenseData = {
  status: 'online',
  cpu: 8,
  mem_used: 1.2,
  mem_total: 4,
  uptime: 1_296_000, // 15 days in seconds
  wan_in: DEMO_OPNSENSE.wanIn,
  wan_out: DEMO_OPNSENSE.wanOut,
}

function toDemoNodes(): ProxmoxNode[] {
  return DEMO_PROXMOX_NODES.map((n: DemoProxmoxNode) => ({
    node: n.node,
    cpuPercent: n.cpuPercent,
    memUsedGB: n.memUsedGB,
    memTotalGB: n.memTotalGB,
    memPercent: n.memPercent,
  }))
}

function toDemoVMs(): ProxmoxVM[] {
  return DEMO_PROXMOX_VMS.map((v: DemoProxmoxVM) => ({
    vmid: v.vmid,
    name: v.name,
    status: v.status,
    cpuPercent: v.cpuPercent,
    memUsedGB: v.memUsedGB,
    memTotalGB: v.memTotalGB,
    node: v.node,
  }))
}

export function useHomelabWidget() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<HomelabData>({
    queryKey: HOMELAB_KEY,
    queryFn: () => api.get<HomelabData>('/api/homelab'),
    refetchInterval: 30_000,
    enabled: !_demo,
  })

  const vms: ProxmoxVM[] = _demo ? toDemoVMs() : (data?.proxmox?.vms ?? [])
  const nodes: ProxmoxNode[] = _demo ? toDemoNodes() : (data?.proxmox?.nodes ?? [])
  const opnsense: OPNsenseData | null = _demo ? DEMO_OPNSENSE_FULL : (data?.opnsense ?? null)

  const runningCount = useMemo(
    () => vms.filter(v => v.status === 'running').length,
    [vms],
  )

  const totalCount = vms.length

  return {
    vms,
    nodes,
    opnsense,
    runningCount,
    totalCount,
    mounted: _demo || isSuccess,
  }
}
