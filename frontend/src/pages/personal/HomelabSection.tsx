import { Cpu, WifiHigh } from '@phosphor-icons/react'
import { Skeleton, SkeletonRows } from '@/components/Skeleton'
import type { ProxmoxVM, ProxmoxNodeStat, OPNsenseData } from './types'

interface HomelabSectionProps {
  proxmoxVMs: ProxmoxVM[]
  proxmoxNodes: ProxmoxNodeStat[]
  opnsense: OPNsenseData | null
  mounted: boolean
}

export default function HomelabSection({ proxmoxVMs, proxmoxNodes, opnsense, mounted }: HomelabSectionProps) {
  return (
    <>
      {/* Proxmox VMs */}
      <div className="card" style={{ padding: '20px', maxHeight: '320px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Cpu size={14} style={{ color: 'var(--green)' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Proxmox VMs</span>
          {proxmoxVMs.length > 0 && (
            <span className="badge badge-green" style={{ marginLeft: 'auto' }}>
              {proxmoxVMs.filter(v => v.status === 'running').length}/{proxmoxVMs.length} running
            </span>
          )}
        </div>
        {!mounted ? (
          <SkeletonRows count={3} />
        ) : (
          <>
            {proxmoxNodes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '10px', background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                {proxmoxNodes.map(n => {
                  const cpuColor = n.cpuPercent >= 85 ? 'var(--red-bright)' : n.cpuPercent >= 60 ? 'var(--warning)' : 'var(--green)'
                  const memColor = n.memPercent >= 85 ? 'var(--red-bright)' : n.memPercent >= 60 ? 'var(--warning)' : 'var(--green)'
                  return (
                    <div key={n.node}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.node}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>CPU</span>
                          <div role="progressbar" aria-valuenow={n.cpuPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${n.node} CPU usage`} style={{ flex: 1, height: '5px', background: 'var(--hover-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${n.cpuPercent}%`, height: '100%', background: cpuColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                          </div>
                          <span className="mono" style={{ fontSize: '10px', color: cpuColor, width: '32px', textAlign: 'right' }}>{n.cpuPercent}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', width: '28px' }}>RAM</span>
                          <div role="progressbar" aria-valuenow={n.memPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`${n.node} RAM usage`} style={{ flex: 1, height: '5px', background: 'var(--hover-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${n.memPercent}%`, height: '100%', background: memColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                          </div>
                          <span className="mono" style={{ fontSize: '10px', color: memColor, width: '32px', textAlign: 'right' }}>{n.memPercent}%</span>
                        </div>
                        <div style={{ paddingLeft: '36px' }}>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{n.memUsedGB}/{n.memTotalGB} GB</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {proxmoxVMs.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No VMs found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
                {proxmoxVMs.map(vm => (
                  <div key={vm.vmid} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                    background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {vm.name}
                      </div>
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {vm.node} &middot; #{vm.vmid}
                      </div>
                    </div>
                    <span className={`badge ${vm.status === 'running' ? 'badge-green' : 'badge-gray'}`}>
                      {vm.status}
                    </span>
                    {vm.status === 'running' && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', minWidth: '80px' }}>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          CPU {vm.cpuPercent}%
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          RAM {vm.memUsedGB}/{vm.memTotalGB}G
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* OPNsense */}
      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <WifiHigh size={14} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>OPNsense</span>
          {opnsense?.version && opnsense.version !== '\u2014' && (
            <span className="mono" style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>v{opnsense.version}</span>
          )}
        </div>
        {!mounted ? (
          <div>
            <Skeleton width="100%" height="44px" />
            <Skeleton width="100%" height="44px" />
            <Skeleton width="120px" height="20px" style={{ marginBottom: 0 }} />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN &darr; in</span>
                <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>{opnsense?.wanIn ?? '\u2014'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-white-03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>WAN &uarr; out</span>
                <span className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-blue)' }}>{opnsense?.wanOut ?? '\u2014'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Firmware</span>
              {opnsense === null ? (
                <span className="badge badge-gray">Checking&hellip;</span>
              ) : opnsense.updateAvailable ? (
                <span className="badge" style={{ background: 'var(--warning-a15)', color: 'var(--warning)', border: '1px solid var(--warning-a30)', borderRadius: '4px', padding: '2px 7px', fontSize: '10px', fontWeight: 600 }}>
                  &#x26A0; Update available
                </span>
              ) : (
                <span className="badge badge-green">&#x2713; Up to date</span>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
