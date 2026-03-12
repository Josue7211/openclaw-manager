import { NextResponse } from 'next/server'
import { homelabFetch } from '@/lib/http'

const MOCK_DATA = {
  proxmox: {
    nodes: [
      { name: 'pve', status: 'online', cpu: 0.12, mem_used: 32000000000, mem_total: 51539607552, uptime: 864000 },
    ],
    vms: [
      { name: 'media-vm', status: 'running', cpu: 0.05, mem: 4294967296 },
      { name: 'nextcloud-vm', status: 'running', cpu: 0.02, mem: 2147483648 },
      { name: 'openclaw-vm', status: 'running', cpu: 0.08, mem: 4294967296 },
    ],
  },
  opnsense: {
    status: 'online',
    cpu: 0.08,
    mem_used: 4000000000,
    mem_total: 16000000000,
    uptime: 1296000,
    wan_in: '15.2 Mbps',
    wan_out: '3.1 Mbps',
  },
}

type VMEntry = { name: string; status: string; cpu: number; mem: number }

async function fetchProxmox() {
  const url = process.env.PROXMOX_HOST || 'https://10.0.0.PROXMOX:8006'
  const tokenId = process.env.PROXMOX_TOKEN_ID || ''
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET || ''

  if (!tokenId || !tokenSecret) return null

  const headers = { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` }

  const nodesRes = await homelabFetch(`${url}/api2/json/nodes`, { headers })
  if (!nodesRes.ok) return null
  const nodesData = await nodesRes.json() as { data: Record<string, unknown>[] }

  const nodes = (nodesData.data || []).map((n: Record<string, unknown>) => ({
    name: n.node as string,
    status: n.status as string,
    cpu: n.cpu as number,
    mem_used: n.mem as number,
    mem_total: n.maxmem as number,
    uptime: n.uptime as number,
  }))

  const toVM = (r: Record<string, unknown>): VMEntry => ({
    name: (r.name as string) || `VM ${r.vmid}`,
    status: r.status as string,
    cpu: (r.cpu as number) || 0,
    mem: (r.mem as number) || 0,
  })

  // Try cluster/resources?type=vm — returns all qemu+lxc across all nodes, any status
  let vms: VMEntry[] = []
  try {
    const resourcesRes = await homelabFetch(`${url}/api2/json/cluster/resources?type=vm`, { headers })
    if (resourcesRes.ok) {
      const resourcesData = await resourcesRes.json() as { data: Record<string, unknown>[] }
      vms = (resourcesData.data || [])
        .filter((r: Record<string, unknown>) => r.type === 'qemu' || r.type === 'lxc')
        .map(toVM)
    }
  } catch { /* fall through to per-node queries */ }

  // Fallback: query each node directly if cluster endpoint returned nothing
  if (vms.length === 0 && nodes.length > 0) {
    const perNodeResults = await Promise.allSettled(
      nodes.flatMap((node: { name: string }) => [
        homelabFetch(`${url}/api2/json/nodes/${node.name}/qemu`, { headers })
          .then(r => r.ok ? r.json() as Promise<{ data?: Record<string, unknown>[] }> : { data: [] })
          .then((d) => ((d as { data?: Record<string, unknown>[] }).data || []).map(toVM)),
        homelabFetch(`${url}/api2/json/nodes/${node.name}/lxc`, { headers })
          .then(r => r.ok ? r.json() as Promise<{ data?: Record<string, unknown>[] }> : { data: [] })
          .then((d) => ((d as { data?: Record<string, unknown>[] }).data || []).map(toVM)),
      ])
    )
    vms = perNodeResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  }

  return { nodes, vms }
}

async function fetchOPNsense() {
  let url = process.env.OPNSENSE_HOST || process.env.OPNSENSE_URL || 'https://10.0.0.1'
  if (url.startsWith('http://')) url = 'https://' + url.slice(7)
  const key = process.env.OPNSENSE_API_KEY || process.env.OPNSENSE_KEY || ''
  const secret = process.env.OPNSENSE_API_SECRET || process.env.OPNSENSE_SECRET || ''

  if (!key || !secret) return null

  const auth = Buffer.from(`${key}:${secret}`).toString('base64')
  const headers = { Authorization: `Basic ${auth}` }

  const [sysRes, timeRes, ifaceRes] = await Promise.allSettled([
    homelabFetch(`${url}/api/diagnostics/system/systemResources`, { headers }),
    homelabFetch(`${url}/api/diagnostics/system/systemTime`, { headers }),
    homelabFetch(`${url}/api/diagnostics/interface/getInterfaceStatistics`, { headers }),
  ])

  let cpu = 0
  let mem_used = 0
  let mem_total = 0
  let uptime = 0
  let wan_in = 'N/A'
  let wan_out = 'N/A'

  if (sysRes.status === 'fulfilled' && sysRes.value.ok) {
    const d = await sysRes.value.json() as { memory?: { total?: string; used?: string } }
    mem_total = parseInt(d.memory?.total || '0', 10)
    mem_used = d.memory?.used != null ? parseInt(d.memory.used, 10) : 0
  }

  if (timeRes.status === 'fulfilled' && timeRes.value.ok) {
    const d = await timeRes.value.json() as { uptime?: string; loadavg?: string }
    // uptime format: "3 days, 03:58:11" — convert to seconds
    const raw: string = d.uptime || ''
    const daysMatch = raw.match(/(\d+)\s+day/)
    const timeMatch = raw.match(/(\d+):(\d+):(\d+)/)
    const days = daysMatch ? parseInt(daysMatch[1]) : 0
    const hours = timeMatch ? parseInt(timeMatch[1]) : 0
    const mins = timeMatch ? parseInt(timeMatch[2]) : 0
    const secs = timeMatch ? parseInt(timeMatch[3]) : 0
    uptime = days * 86400 + hours * 3600 + mins * 60 + secs
    // CPU from load average (1-min / 4 CPUs as rough estimate)
    const loadMatch = (d.loadavg || '').match(/^([\d.]+)/)
    if (loadMatch) cpu = Math.min(parseFloat(loadMatch[1]) / 4, 1)
  }

  if (ifaceRes.status === 'fulfilled' && ifaceRes.value.ok) {
    const d = await ifaceRes.value.json() as { statistics?: Record<string, Record<string, unknown>> }
    const stats: Record<string, Record<string, unknown>> = d.statistics || {}
    // Find WAN entry — key contains "[WAN]"
    const wanEntry = Object.entries(stats).find(([k]) => k.includes('[WAN]') || k.includes('WAN'))
    if (wanEntry) {
      const iface = wanEntry[1]
      const bytesIn = parseInt(iface['received-bytes'] as string || '0', 10)
      const bytesOut = parseInt(iface['sent-bytes'] as string || '0', 10)
      const fmt = (b: number) => {
        if (b >= 1e12) return `${(b / 1e12).toFixed(1)} TB`
        if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
        if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
        return `${(b / 1e3).toFixed(1)} KB`
      }
      wan_in = fmt(bytesIn)
      wan_out = fmt(bytesOut)
    }
  }

  return { status: 'online', cpu, mem_used, mem_total, uptime, wan_in, wan_out }
}

export async function GET() {
  try {
    const [proxmoxResult, opnsenseResult] = await Promise.allSettled([
      fetchProxmox(),
      fetchOPNsense(),
    ])

    const proxmox =
      proxmoxResult.status === 'fulfilled' && proxmoxResult.value
        ? proxmoxResult.value
        : MOCK_DATA.proxmox

    const opnsense =
      opnsenseResult.status === 'fulfilled' && opnsenseResult.value
        ? opnsenseResult.value
        : MOCK_DATA.opnsense

    return NextResponse.json({ proxmox, opnsense })
  } catch {
    return NextResponse.json({ proxmox: MOCK_DATA.proxmox, opnsense: MOCK_DATA.opnsense })
  }
}
