import { memo, useEffect, useState } from 'react'
import type React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { hermesControl } from '@/lib/hermes-control'
import { btnSecondary, btnStyle, inputStyle, row, rowLast, sectionLabel, val } from '@/features/settings/shared'

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-elevated)',
  padding: 16,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 16,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function StatusPill({ ok, label }: { ok?: boolean | null; label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      color: ok ? 'var(--green-500)' : ok === false ? 'var(--red-500)' : 'var(--text-muted)',
      fontSize: 12,
      fontWeight: 600,
    }}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: ok ? 'var(--green-500)' : ok === false ? 'var(--red-500)' : 'var(--text-muted)',
      }} />
      {label}
    </span>
  )
}

function MutationResult({ value }: { value: unknown }) {
  if (!value) return null
  return (
    <pre style={{
      margin: '10px 0 0',
      maxHeight: 180,
      overflow: 'auto',
      background: 'var(--bg-white-03)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 10,
      fontSize: 11,
      color: 'var(--text-secondary)',
    }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export const HermesAgentSection = memo(function HermesAgentSection() {
  const queryClient = useQueryClient()
  const status = useQuery({ queryKey: ['hermes-control', 'status'], queryFn: hermesControl.status, refetchInterval: 10000 })
  const infra = useQuery({ queryKey: ['hermes-control', 'infra'], queryFn: hermesControl.infra })
  const discord = useQuery({ queryKey: ['hermes-control', 'discord'], queryFn: hermesControl.discordDiscover })
  const bluebubbles = useQuery({ queryKey: ['hermes-control', 'bluebubbles'], queryFn: hermesControl.bluebubblesDiscover })
  const matrix = useQuery({ queryKey: ['hermes-control', 'matrix'], queryFn: hermesControl.matrixAudit })
  const dashboardNode = infra.data?.nodes?.find(node => node.id === 'hermes-dashboard')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 0 }}>
      <div>
        <div style={sectionLabel}>Hermes Agent Control Plane</div>
        <HermesDashboardUrlSetup
          value={dashboardNode?.url}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['hermes-control'] })
          }}
        />
        <div style={gridStyle}>
          <div style={cardStyle}>
            <div style={row}><span>Version</span><span style={val}>{status.data?.version ?? '--'}</span></div>
            <div style={row}><span>Gateway</span><StatusPill ok={status.data?.gateway_running} label={status.data?.gateway_state ?? 'unknown'} /></div>
            <div style={row}><span>PID</span><span style={val}>{status.data?.gateway_pid ?? '--'}</span></div>
            <div style={rowLast}><span>Active sessions</span><span style={val}>{status.data?.active_sessions ?? '--'}</span></div>
          </div>
          <div style={cardStyle}>
            <div style={{ ...row, alignItems: 'flex-start' }}>
              <span>Platforms</span>
              <span style={{ ...val, whiteSpace: 'normal', textAlign: 'right' }}>
                {Object.keys(status.data?.gateway_platforms ?? {}).join(', ') || 'none active'}
              </span>
            </div>
            <div style={rowLast}>
              <span>Restart state</span>
              <span style={val}>manual restart after env/config changes</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Infra Map</div>
        <div style={gridStyle}>
          {(infra.data?.nodes ?? []).map(node => (
            <div key={node.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>{node.label}</strong>
                <StatusPill
                  ok={node.configured ? node.peer_verified ?? undefined : false}
                  label={node.configured ? node.peer_hostname ?? 'configured' : 'not configured'}
                />
              </div>
              <div style={{ ...val, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{node.url || 'Set this in settings/secrets.'}</div>
            </div>
          ))}
        </div>
      </div>

      <DiscordSetup
        defaults={discord.data?.defaults}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['hermes-control'] })
        }}
      />

      <BlueBubblesSetup
        host={bluebubbles.data?.bluebubbles?.host}
        passwordConfigured={bluebubbles.data?.bluebubbles?.passwordConfigured}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['hermes-control'] })
        }}
      />

      <div>
        <div style={sectionLabel}>Matrix Retirement</div>
        <div style={cardStyle}>
          <div style={row}>
            <span>Status</span>
            <span style={val}>{matrix.data?.status ?? 'checking'}</span>
          </div>
          <div style={row}>
            <span>Active keys</span>
            <span style={{ ...val, whiteSpace: 'normal', textAlign: 'right' }}>
              {matrix.data?.activeKeys?.join(', ') || 'none'}
            </span>
          </div>
          <MatrixDisableButton disabled={!matrix.data?.activeKeys?.length} />
        </div>
      </div>
    </div>
  )
})

function HermesDashboardUrlSetup({
  value,
  onChanged,
}: {
  value?: string
  onChanged: () => void
}) {
  const [dashboardUrl, setDashboardUrl] = useState(value ?? '')
  const save = useMutation({
    mutationFn: async () => {
      const normalized = dashboardUrl.trim().replace(/\/+$/, '')
      if (!normalized) throw new Error('Enter the Hermes control dashboard URL.')
      try {
        await api.put('/api/secrets/hermes-dashboard', { credentials: { dashboard_url: normalized } })
      } catch (error) {
        if (!window.__TAURI_INTERNALS__) throw error
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'hermes.dashboard-url', value: normalized })
        return {
          ok: true,
          key: 'HERMES_DASHBOARD_URL',
          value: normalized,
          mode: 'local-keychain',
          note: 'Saved locally. Restart the backend if the control plane does not update immediately.',
        }
      }
      if (window.__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'hermes.dashboard-url', value: normalized }).catch(() => {})
      }
      return { ok: true, key: 'HERMES_DASHBOARD_URL', value: normalized, mode: 'synced' }
    },
    onSuccess: onChanged,
  })

  useEffect(() => {
    if (value) setDashboardUrl(value)
  }, [value])

  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={gridStyle}>
        <label style={fieldStyle}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Control dashboard URL</span>
          <input
            style={{ ...inputStyle, width: '100%' }}
            value={dashboardUrl}
            onChange={event => setDashboardUrl(event.target.value)}
            placeholder="http://hermes-dashboard.local:9119"
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button style={btnStyle} onClick={() => save.mutate()} disabled={save.isPending}>
          Save control URL
        </button>
      </div>
      <MutationResult value={save.data ?? save.error?.message} />
    </div>
  )
}

function DiscordSetup({
  defaults,
  onChanged,
}: {
  defaults?: { requireMention: boolean; replyToMode: string }
  onChanged: () => void
}) {
  const [token, setToken] = useState('')
  const [allowedUsers, setAllowedUsers] = useState('')
  const [allowedChannels, setAllowedChannels] = useState('')
  const [replyToMode, setReplyToMode] = useState(defaults?.replyToMode ?? 'first')
  const [requireMention, setRequireMention] = useState(defaults?.requireMention ?? true)
  const test = useMutation({ mutationFn: hermesControl.discordTestToken })
  const save = useMutation({
    mutationFn: hermesControl.discordSave,
    onSuccess: onChanged,
  })
  const certify = useMutation({ mutationFn: hermesControl.discordCertify })
  const testedChannels = Array.isArray((test.data as { channels?: unknown[] } | undefined)?.channels)
    ? ((test.data as { channels: Array<Record<string, unknown>> }).channels)
    : []

  useEffect(() => {
    if (defaults?.replyToMode) setReplyToMode(defaults.replyToMode)
    if (defaults?.requireMention != null) setRequireMention(defaults.requireMention)
  }, [defaults])

  return (
    <div>
      <div style={sectionLabel}>Discord: Local AI Club</div>
      <div style={cardStyle}>
        <div style={gridStyle}>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Bot token</span>
            <input style={{ ...inputStyle, width: '100%' }} type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste token or leave blank to use saved token" />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Allowed channel IDs</span>
            <input style={{ ...inputStyle, width: '100%' }} value={allowedChannels} onChange={e => setAllowedChannels(e.target.value)} placeholder="comma-separated channel IDs" />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Allowed user IDs</span>
            <input style={{ ...inputStyle, width: '100%' }} value={allowedUsers} onChange={e => setAllowedUsers(e.target.value)} placeholder="comma-separated user IDs" />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reply mode</span>
            <select style={{ ...inputStyle, width: '100%' }} value={replyToMode} onChange={e => setReplyToMode(e.target.value)}>
              <option value="first">first</option>
              <option value="all">all</option>
              <option value="off">off</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={requireMention} onChange={e => setRequireMention(e.target.checked)} />
          Require mention in Local AI Club
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button style={btnSecondary} onClick={() => test.mutate({ token, guildName: 'Local AI Club' })} disabled={test.isPending}>Test token</button>
          <button
            style={btnStyle}
            onClick={() => save.mutate({
              token,
              allowedUsers: splitCsv(allowedUsers),
              allowedChannels: splitCsv(allowedChannels),
              replyToMode,
              requireMention,
              autoThread: true,
              reactions: true,
            })}
            disabled={save.isPending}
          >
            Save Discord setup
          </button>
          <button style={btnSecondary} onClick={() => certify.mutate()} disabled={certify.isPending}>Certify</button>
        </div>
        {testedChannels.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Visible Local AI Club channels</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {testedChannels
                .filter(channel => channel.type === 0 || channel.type === 5 || channel.type === 15)
                .map(channel => {
                  const id = String(channel.id ?? '')
                  const name = String(channel.name ?? id)
                  return (
                    <button
                      key={id}
                      style={btnSecondary}
                      onClick={() => {
                        const next = new Set(splitCsv(allowedChannels))
                        if (id) next.add(id)
                        setAllowedChannels([...next].join(', '))
                      }}
                    >
                      #{name}
                    </button>
                  )
                })}
            </div>
          </div>
        )}
        <MutationResult value={test.data ?? save.data ?? certify.data ?? test.error?.message ?? save.error?.message ?? certify.error?.message} />
      </div>
    </div>
  )
}

function BlueBubblesSetup({
  host,
  passwordConfigured,
  onChanged,
}: {
  host?: string
  passwordConfigured?: boolean
  onChanged: () => void
}) {
  const [bbHost, setBbHost] = useState(host ?? '')
  const [password, setPassword] = useState('')
  const [allowedUsers, setAllowedUsers] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<Record<string, unknown> | null>(null)
  const conversations = useQuery({
    queryKey: ['messages', 'hermes-bluebubbles-groups'],
    queryFn: () => api.get<{ conversations?: unknown[] }>('/api/messages?limit=100'),
    retry: false,
  })
  const test = useMutation({ mutationFn: hermesControl.bluebubblesTest })
  const save = useMutation({ mutationFn: hermesControl.bluebubblesSave, onSuccess: onChanged })
  const certify = useMutation({ mutationFn: hermesControl.bluebubblesCertify })

  useEffect(() => {
    if (host) setBbHost(host)
  }, [host])

  return (
    <div>
      <div style={sectionLabel}>BlueBubbles / iMessage</div>
      <div style={cardStyle}>
        <div style={gridStyle}>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>BlueBubbles URL</span>
            <input style={{ ...inputStyle, width: '100%' }} value={bbHost} onChange={e => setBbHost(e.target.value)} placeholder="http://bluebubbles.local:1234" />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Password</span>
            <input style={{ ...inputStyle, width: '100%' }} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={passwordConfigured ? 'saved password available' : 'BlueBubbles password'} />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Allowed iMessage handles</span>
            <input style={{ ...inputStyle, width: '100%' }} value={allowedUsers} onChange={e => setAllowedUsers(e.target.value)} placeholder="emails or phone numbers, comma-separated" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <button style={btnSecondary} onClick={() => test.mutate({ host: bbHost, password })} disabled={test.isPending}>Test BlueBubbles</button>
          <button style={btnStyle} onClick={() => save.mutate({ host: bbHost, password, allowedUsers: splitCsv(allowedUsers) })} disabled={save.isPending}>Save iMessage setup</button>
          <button style={btnSecondary} onClick={() => certify.mutate()} disabled={certify.isPending}>Certify</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>iMessage group chat picker</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflow: 'auto' }}>
            {(conversations.data?.conversations ?? [])
              .flatMap(raw => raw && typeof raw === 'object' ? [raw as Record<string, unknown>] : [])
              .filter(conversation => {
                const participants = Array.isArray(conversation.participants) ? conversation.participants : []
                return participants.length > 1 || Boolean(conversation.groupTitle)
              })
              .map(conversation => {
                const guid = String(conversation.guid ?? '')
                const title = String(conversation.displayName ?? conversation.groupTitle ?? guid)
                const active = selectedGroup?.guid === guid
                return (
                  <button
                    key={guid}
                    style={{
                      ...btnSecondary,
                      textAlign: 'left',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
                    }}
                    onClick={() => setSelectedGroup(conversation)}
                  >
                    {title}
                  </button>
                )
              })}
            {!conversations.isLoading && (conversations.data?.conversations ?? []).length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No conversations loaded from BlueBubbles yet.</span>
            )}
          </div>
          {selectedGroup && (
            <div style={{ ...val, marginTop: 8, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
              Selected group GUID: {String(selectedGroup.guid ?? '')}
            </div>
          )}
        </div>
        <MutationResult value={test.data ?? save.data ?? certify.data ?? test.error?.message ?? save.error?.message ?? certify.error?.message} />
      </div>
    </div>
  )
}

function MatrixDisableButton({ disabled }: { disabled: boolean }) {
  const [confirm, setConfirm] = useState(false)
  const disable = useMutation({ mutationFn: hermesControl.matrixDisable })

  if (!confirm) {
    return (
      <div style={rowLast}>
        <span>Disable Matrix env</span>
        <button style={btnSecondary} disabled={disabled} onClick={() => setConfirm(true)}>Prepare cleanup</button>
      </div>
    )
  }

  return (
    <div style={rowLast}>
      <span>Confirm Matrix cleanup</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnSecondary} onClick={() => setConfirm(false)}>Cancel</button>
        <button style={btnStyle} onClick={() => disable.mutate()} disabled={disable.isPending}>Disable Matrix</button>
      </div>
    </div>
  )
}
