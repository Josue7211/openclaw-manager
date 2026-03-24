import { useQuery } from '@tanstack/react-query'
import { Monitor, ArrowSquareOut, GearSix, WifiHigh, WifiSlash, Info } from '@phosphor-icons/react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'

interface RemoteStatus {
  configured: boolean
  reachable: boolean
  host?: string
  message: string
}

export default function RemotePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['remote', 'status'],
    queryFn: () => api.get<RemoteStatus>('/api/remote/status'),
    refetchInterval: 10_000,
  })

  const configured = data?.configured ?? false
  const reachable = data?.reachable ?? false
  const host = data?.host ?? ''

  const statusColor = !configured
    ? 'var(--text-muted)'
    : reachable
      ? 'var(--green-500)'
      : 'var(--red-500)'

  const StatusIcon = !configured ? GearSix : reachable ? WifiHigh : WifiSlash

  return (
    <div style={{ padding: '0' }}>
      <PageHeader defaultTitle="Remote Desktop" defaultSubtitle="Sunshine + Moonlight streaming" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '24px',
        padding: '0 16px',
      }}>
        {/* Status card */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '40px 48px',
          maxWidth: '520px',
          width: '100%',
          textAlign: 'center',
        }}>
          <Monitor size={48} weight="duotone" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />

          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
            OpenClaw VM
          </h2>

          {/* Status indicator */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '24px',
            padding: '6px 16px',
            borderRadius: '999px',
            background: 'color-mix(in srgb, ' + statusColor + ' 12%, transparent)',
          }}>
            <StatusIcon size={16} style={{ color: statusColor }} />
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
              flexShrink: 0,
              animation: reachable ? 'pulse 2s ease-in-out infinite' : undefined,
            }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {isLoading ? 'Checking...' : data?.message ?? 'Unknown'}
            </span>
          </div>

          {/* Connected state: actions */}
          {configured && reachable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => {
                  window.open('moonlight:', '_blank')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'var(--accent)',
                  color: 'var(--text-on-accent)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  transition: 'all 0.2s var(--ease-spring)',
                }}
                aria-label="Launch Moonlight streaming client"
              >
                <ArrowSquareOut size={16} />
                Launch Moonlight
              </button>

              {host && (
                <a
                  href={`https://${host.split(':')[0]}:47990`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    textDecoration: 'underline',
                  }}
                >
                  Sunshine Web Admin
                </a>
              )}
            </div>
          )}

          {/* Configured but unreachable */}
          {configured && !reachable && !isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                disabled
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: 'var(--hover-bg)',
                  color: 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'not-allowed',
                }}
                aria-label="Launch Moonlight streaming client"
              >
                <ArrowSquareOut size={16} />
                Launch Moonlight
              </button>

              <div style={{
                background: 'color-mix(in srgb, var(--amber) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--amber) 20%, transparent)',
                borderRadius: '10px',
                padding: '12px 16px',
                textAlign: 'left',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)', marginBottom: '6px' }}>
                  Sunshine is unreachable
                </div>
                <ul style={{
                  margin: 0,
                  paddingLeft: '16px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.8,
                }}>
                  <li>Verify the OpenClaw VM is powered on</li>
                  <li>Check that Sunshine is running on the VM</li>
                  <li>Ensure Tailscale is connected on both machines</li>
                  <li>Confirm the host IP/port in Settings is correct</li>
                </ul>
              </div>
            </div>
          )}

          {/* Not configured: setup instructions */}
          {!configured && !isLoading && (
            <div style={{ textAlign: 'left' }}>
              <div style={{
                background: 'color-mix(in srgb, var(--blue) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--blue) 20%, transparent)',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '16px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}>
                  <Info size={16} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--blue)' }}>
                    Setup Required
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.6 }}>
                  Remote Desktop uses Sunshine (host) and Moonlight (client) for low-latency streaming. Follow these steps to connect:
                </p>
                <ol style={{
                  margin: 0,
                  paddingLeft: '18px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 2,
                }}>
                  <li>
                    Install <strong style={{ color: 'var(--text-primary)' }}>Sunshine</strong> on the remote machine
                  </li>
                  <li>
                    Ensure both machines are on the same <strong style={{ color: 'var(--text-primary)' }}>Tailscale</strong> network
                  </li>
                  <li>
                    Set{' '}
                    <code style={{
                      background: 'var(--hover-bg)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '11px',
                    }}>
                      SUNSHINE_HOST
                    </code>{' '}
                    in <strong style={{ color: 'var(--text-primary)' }}>Settings &gt; Connections</strong>
                  </li>
                  <li>
                    Install <strong style={{ color: 'var(--text-primary)' }}>Moonlight</strong> on this machine
                  </li>
                  <li>
                    Pair Moonlight with Sunshine using the PIN displayed in the Sunshine web UI
                  </li>
                </ol>
              </div>

              <div style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                lineHeight: 1.6,
                padding: '0 4px',
              }}>
                The host value should be the Tailscale IP or hostname of the remote machine (e.g.{' '}
                <code style={{
                  background: 'var(--hover-bg)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                }}>
                  100.x.x.x
                </code>
                ). Sunshine defaults to port 47990 for its web admin.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
