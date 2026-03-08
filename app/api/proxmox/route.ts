import { NextResponse } from 'next/server'

const PROXMOX_HOST = 'https://10.0.0.PROXMOX:8006'
const AUTH_HEADER = 'PVEAPIToken=root@pam!mission-control=4837631f-fc84-4fe5-81e5-ae5545cf5d6f'

async function proxmoxFetch(path: string) {
  const res = await fetch(`${PROXMOX_HOST}${path}`, {
    headers: { Authorization: AUTH_HEADER },
    // @ts-expect-error - Node fetch option for self-signed certs
    agent: undefined,
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Proxmox ${path} => ${res.status}`)
  const json = await res.json()
  return json.data
}

export async function GET() {
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

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
  } catch (err) {
    console.error('Proxmox fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch Proxmox data' }, { status: 500 })
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'
  }
}
