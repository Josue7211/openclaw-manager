import { NextResponse } from 'next/server'
import { homelabFetch } from '@/lib/http'

const PROXMOX_HOST = process.env.PROXMOX_HOST || 'https://10.0.0.PROXMOX:8006'
const TOKEN_ID = process.env.PROXMOX_TOKEN_ID || ''
const TOKEN_SECRET = process.env.PROXMOX_TOKEN_SECRET || ''

async function proxmoxFetch(path: string) {
  const res = await homelabFetch(`${PROXMOX_HOST}${path}`, {
    headers: { Authorization: `PVEAPIToken=${TOKEN_ID}=${TOKEN_SECRET}` },
  })
  if (!res.ok) throw new Error(`Proxmox API error: ${res.status}`)
  const json = await res.json()
  return json.data
}

export async function GET() {
  try {
    const nodes: { node: string }[] = await proxmoxFetch('/api2/json/nodes')

    const [vmArrays, nodeStatResults] = await Promise.all([
      Promise.all(
        nodes.map(async ({ node }) => {
          try {
            const vms: {
              vmid: number
              name: string
              status: string
              cpu: number
              mem: number
              maxmem: number
            }[] = await proxmoxFetch(`/api2/json/nodes/${node}/qemu`)

            return vms.map(vm => ({
              vmid: vm.vmid,
              name: vm.name || `vm-${vm.vmid}`,
              status: vm.status,
              cpuPercent: Math.round((vm.cpu ?? 0) * 100),
              memUsedGB: parseFloat(((vm.mem ?? 0) / 1073741824).toFixed(1)),
              memTotalGB: parseFloat(((vm.maxmem ?? 0) / 1073741824).toFixed(1)),
              node,
            }))
          } catch {
            return []
          }
        })
      ),
      Promise.all(
        nodes.map(async ({ node }) => {
          try {
            const s: { cpu: number; memory: { used: number; total: number } } =
              await proxmoxFetch(`/api2/json/nodes/${node}/status`)
            const cpuPercent = Math.round((s.cpu ?? 0) * 100)
            const memUsedGB = parseFloat(((s.memory?.used ?? 0) / 1073741824).toFixed(1))
            const memTotalGB = parseFloat(((s.memory?.total ?? 0) / 1073741824).toFixed(1))
            const memPercent = memTotalGB > 0 ? Math.round((memUsedGB / memTotalGB) * 100) : 0
            return { node, cpuPercent, memUsedGB, memTotalGB, memPercent }
          } catch {
            return null
          }
        })
      ),
    ])

    const vms = vmArrays.flat().sort((a, b) => a.vmid - b.vmid)
    const nodeStats = nodeStatResults.filter(Boolean)
    return NextResponse.json({ vms, nodeStats })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch Proxmox data' }, { status: 500 })
  }
}
