import { useQuery } from '@tanstack/react-query'
import { Monitor, ArrowSquareOut } from '@phosphor-icons/react'
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

  return (
    <div style={{ padding: '0' }}>
      <PageHeader defaultTitle="Remote Desktop" />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '24px',
      }}>
        {/* Status card */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '40px 48px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
        }}>
          <Monitor size={48} weight="duotone" style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />

          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
            OpenClaw VM
          </h2>

          {/* Status indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '24px',
          }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: statusColor,
              display: 'inline-block',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {isLoading ? 'Checking...' : data?.message ?? 'Unknown'}
            </span>
          </div>

          {/* Actions */}
          {configured && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => {
                  window.open('moonlight:', '_blank')
                }}
                disabled={!reachable}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  background: reachable ? 'var(--accent)' : 'var(--hover-bg)',
                  color: reachable ? 'var(--text-on-accent)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: reachable ? 'pointer' : 'not-allowed',
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

          {!configured && !isLoading && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Set <code style={{ background: 'var(--hover-bg)', padding: '2px 6px', borderRadius: '4px' }}>SUNSHINE_HOST</code> in Settings &gt; Connections to enable remote desktop.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
