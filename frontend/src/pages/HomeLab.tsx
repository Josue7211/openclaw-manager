


import { useTauriQuery } from '@/hooks/useTauriQuery'
import { PageHeader } from '@/components/PageHeader'

interface VMInfo {
  name: string
  status: string
  cpu: number
  mem: number
}

interface NodeInfo {
  name: string
  status: string
  cpu: number
  mem_used: number
  mem_total: number
  uptime: number
}

interface ProxmoxData {
  nodes: NodeInfo[]
  vms: VMInfo[]
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

interface HoblabData {
  proxmox: ProxmoxData
  opnsense: OPNsenseData
  mock?: boolean
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}

function cpuColor(cpu: number): string {
  if (cpu > 0.7) return 'var(--red)'
  if (cpu > 0.5) return '#f0a500'
  return 'var(--green)'
}

function CpuBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = cpuColor(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1,
        height: '6px',
        background: 'var(--bg-elevated)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color, fontFamily: 'monospace', minWidth: '36px', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function MemBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = pct > 85 ? 'var(--red)' : pct > 65 ? '#f0a500' : 'var(--accent-blue)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1,
        height: '6px',
        background: 'var(--bg-elevated)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: '80px', textAlign: 'right' }}>
        {formatBytes(used)} / {formatBytes(total)}
      </span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const online = status === 'online' || status === 'running'
  return (
    <span style={{
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: online ? 'var(--green)' : 'var(--red)',
      boxShadow: online ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
      flexShrink: 0,
    }} />
  )
}

const card: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '20px',
}

const label: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: '4px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: '12px',
}

export default function HomelabPage() {
  const { data, isLoading: loading, error, refetch, dataUpdatedAt } = useTauriQuery<HoblabData>(
    ['homelab'],
    '/api/homelab',
    { refetchInterval: 30000 },
  )

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>🖥️</span>
            <PageHeader defaultTitle="Home Lab Vitals" defaultSubtitle="Proxmox + OPNsense infrastructure health" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastUpdated && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>
          Loading infrastructure data...
        </div>
      )}

      {error && (
        <div style={{
          ...card,
          borderColor: 'var(--red)',
          color: 'var(--red)',
          fontFamily: 'monospace',
          fontSize: '13px',
          marginBottom: '20px',
        }}>
          Error: {(error as Error).message}
        </div>
      )}

      {data?.mock && (
        <div style={{
          marginBottom: '20px', padding: '20px 24px',
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '16px' }}>🖥️</span>
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'rgba(96, 165, 250, 1)' }}>Homelab not configured</span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Showing demo data. Add the following to <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px' }}>.env.local</code> and restart:
          </p>
          <pre style={{ margin: '0', padding: '12px 16px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-primary)', overflowX: 'auto', lineHeight: 1.8 }}>
{`PROXMOX_HOST=https://your-proxmox-ip:8006
PROXMOX_TOKEN_ID=user@pam!token-name
PROXMOX_TOKEN_SECRET=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

OPNSENSE_HOST=https://your-opnsense-ip
OPNSENSE_KEY=your-api-key
OPNSENSE_SECRET=your-api-secret`}
          </pre>
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Proxmox Section */}
          <div>
            <div style={sectionTitle}>
              <span style={{ color: 'var(--accent)' }}>◈</span> Proxmox Hypervisor
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

              {/* Node Cards */}
              {data.proxmox.nodes.map(node => (
                <div key={node.name} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <StatusDot status={node.status} />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                      {node.name}
                    </span>
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: node.status === 'online' ? 'rgba(59,165,92,0.15)' : 'rgba(237,66,69,0.15)',
                      color: node.status === 'online' ? 'var(--green-bright)' : 'var(--red-bright)',
                      fontFamily: 'monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {node.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <div style={label}>CPU Usage</div>
                      <CpuBar value={node.cpu} />
                    </div>
                    <div>
                      <div style={label}>Memory</div>
                      <MemBar used={node.mem_used} total={node.mem_total} />
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={label}>Uptime</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                          {formatUptime(node.uptime)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* VM List Card */}
              <div style={{ ...card, gridColumn: data.proxmox.nodes.length === 1 ? '2' : '1 / -1' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                    Virtual Machines
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {data.proxmox.vms.filter(v => v.status === 'running').length}/{data.proxmox.vms.length} running
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {data.proxmox.vms.map(vm => (
                    <div key={vm.name} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                    }}>
                      <StatusDot status={vm.status} />
                      <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        {vm.name}
                      </span>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>CPU</div>
                          <div style={{ fontSize: '12px', color: cpuColor(vm.cpu), fontFamily: 'monospace' }}>
                            {Math.round(vm.cpu * 100)}%
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>RAM</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {formatBytes(vm.mem)}
                          </div>
                        </div>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: vm.status === 'running' ? 'rgba(59,165,92,0.12)' : 'rgba(237,66,69,0.12)',
                          color: vm.status === 'running' ? 'var(--green-bright)' : 'var(--red-bright)',
                          fontFamily: 'monospace',
                          textTransform: 'uppercase',
                        }}>
                          {vm.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {data.proxmox.vms.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '12px' }}>
                      No VMs found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* OPNsense Section */}
          <div>
            <div style={sectionTitle}>
              <span style={{ color: 'var(--accent-blue)' }}>◈</span> OPNsense Router
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>

              {/* Status Card */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <StatusDot status={data.opnsense.status} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '15px' }}>
                    Router
                  </span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: data.opnsense.status === 'online' ? 'rgba(59,165,92,0.15)' : 'rgba(237,66,69,0.15)',
                    color: data.opnsense.status === 'online' ? 'var(--green-bright)' : 'var(--red-bright)',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                  }}>
                    {data.opnsense.status}
                  </span>
                </div>
                <div>
                  <div style={label}>Uptime</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {formatUptime(data.opnsense.uptime)}
                  </div>
                </div>
              </div>

              {/* CPU + RAM Card */}
              <div style={card}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px' }}>
                  Resources
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={label}>CPU</div>
                    <CpuBar value={data.opnsense.cpu} />
                  </div>
                  <div>
                    <div style={label}>Memory</div>
                    <MemBar used={data.opnsense.mem_used} total={data.opnsense.mem_total} />
                  </div>
                </div>
              </div>

              {/* WAN Traffic Card */}
              <div style={card}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '16px' }}>
                  WAN Traffic
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <div style={label}>Inbound</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--green-bright)', fontFamily: 'monospace' }}>
                      ↓ {data.opnsense.wan_in}
                    </div>
                  </div>
                  <div>
                    <div style={label}>Outbound</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'monospace' }}>
                      ↑ {data.opnsense.wan_out}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  )
}
