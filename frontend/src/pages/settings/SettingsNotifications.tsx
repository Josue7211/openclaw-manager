import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useLocalStorageState } from '@/lib/hooks/useLocalStorageState'
import Toggle from './Toggle'
import { Button } from '@/components/ui/Button'
import { row, rowLast, inputStyle, sectionLabel } from './shared'

interface Pref {
  key: string
  value: string
}

export default function SettingsNotifications() {
  const [dndEnabled, setDndEnabled] = useLocalStorageState('dnd-enabled', false)
  const [systemNotifs, setSystemNotifs] = useLocalStorageState('system-notifs', true)
  const [inAppNotifs, setInAppNotifs] = useLocalStorageState('in-app-notifs', true)
  const [notifSound, setNotifSound] = useLocalStorageState('notif-sound', true)
  const [ntfyUrl, setNtfyUrl] = useState('')
  const [ntfyTopic, setNtfyTopic] = useState('mission-control')
  const [ntfyStatus, setNtfyStatus] = useState<string | null>(null)
  const [ntfyTesting, setNtfyTesting] = useState(false)

  const { data: prefsData } = useQuery<{ prefs: Pref[] }>({
    queryKey: queryKeys.prefs,
    queryFn: () => api.get<{ prefs: Pref[] }>('/api/prefs'),
    meta: { onSettled: true },
  })

  useEffect(() => {
    if (prefsData?.prefs) {
      for (const p of prefsData.prefs) {
        if (p.key === 'ntfy_url' && p.value) setNtfyUrl(p.value)
        if (p.key === 'ntfy_topic' && p.value) setNtfyTopic(p.value)
      }
    }
  }, [prefsData])

  const saveNtfyMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.patch('/api/prefs', { key: 'ntfy_url', value: ntfyUrl }),
        api.patch('/api/prefs', { key: 'ntfy_topic', value: ntfyTopic }),
      ])
    },
    onSuccess: () => setNtfyStatus('Saved.'),
    onError: () => setNtfyStatus('Error saving.'),
  })

  async function testNtfy() {
    setNtfyTesting(true)
    setNtfyStatus(null)
    try {
      const json = await api.post<{ ok?: boolean; error?: string }>('/api/notify', {
        title: 'OpenClaw Manager',
        message: 'Test notification from OpenClaw Manager',
        priority: 3,
        tags: ['bell'],
      })
      setNtfyStatus(json.ok ? 'Notification sent!' : `Error: ${json.error}`)
    } catch (e: unknown) {
      setNtfyStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setNtfyTesting(false)
    }
  }

  return (
    <div>
      <div style={sectionLabel}>Notification Preferences</div>
      <div style={row}>
        <div>
          <span>Do Not Disturb</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Silence all notifications</div>
        </div>
        <Toggle on={dndEnabled} onToggle={v => { setDndEnabled(v) }} label="Do Not Disturb" />
      </div>
      <div style={row}>
        <div>
          <span>System notifications</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>OS-level alerts for new messages</div>
        </div>
        <Toggle on={systemNotifs} onToggle={v => { setSystemNotifs(v) }} label="System notifications" />
      </div>
      <div style={row}>
        <div>
          <span>In-app notifications</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Toast banners within the app</div>
        </div>
        <Toggle on={inAppNotifs} onToggle={v => { setInAppNotifs(v) }} label="In-app notifications" />
      </div>
      <div style={row}>
        <div>
          <span>Notification sound</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Play chime on new messages</div>
        </div>
        <Toggle on={notifSound} onToggle={v => { setNotifSound(v) }} label="Notification sound" />
      </div>

      <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button
          variant="secondary"
          style={{ fontSize: '12px', padding: '8px 16px' }}
          onClick={async () => {
            if (dndEnabled) {
              // DND on — show confirmation that nothing fired
              const el = document.createElement('div')
              el.textContent = 'DND active — all notifications silenced'
              Object.assign(el.style, {
                position: 'fixed', top: '16px', right: '16px', zIndex: '10000',
                padding: '12px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: '600',
                background: 'var(--red-a15)', border: '1px solid var(--red-a30)',
                color: 'var(--red)', boxShadow: '0 8px 32px var(--overlay-light)',
                animation: 'fadeInUp 0.3s ease',
              })
              document.body.appendChild(el)
              setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 2000)
              return
            }
            // Chime
            if (notifSound) {
              try {
                const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
                if (ctx.state === 'suspended') await ctx.resume()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain); gain.connect(ctx.destination)
                osc.type = 'sine'
                osc.frequency.setValueAtTime(880, ctx.currentTime)
                osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.08)
                osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.16)
                gain.gain.setValueAtTime(0.25, ctx.currentTime)
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
                osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35)
                osc.onended = () => ctx.close()
              } catch { /* */ }
            }
            // System
            if (systemNotifs && typeof Notification !== 'undefined') {
              if (Notification.permission === 'default') await Notification.requestPermission()
              if (Notification.permission === 'granted') {
                new Notification('OpenClaw Manager', { body: 'This is a test notification', tag: 'mc-test-' + Date.now() })
              }
            }
            // In-app (just a brief visual confirmation here since we're not on Messages page)
            if (inAppNotifs) {
              const el = document.createElement('div')
              el.textContent = 'Test in-app notification'
              Object.assign(el.style, {
                position: 'fixed', top: '16px', right: '16px', zIndex: '10000',
                padding: '12px 20px', borderRadius: '12px', fontSize: '13px', fontWeight: '600',
                background: 'var(--bg-modal)', border: '1px solid var(--border-hover)',
                color: 'var(--text-primary)', boxShadow: '0 8px 32px var(--overlay-light)',
                animation: 'fadeInUp 0.3s ease',
              })
              document.body.appendChild(el)
              setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300) }, 3000)
            }
            if (!notifSound && !systemNotifs && !inAppNotifs) {
              alert('All notification types are disabled.')
            }
          }}
        >
          Send test notification
        </Button>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {dndEnabled ? 'DND is on — test will verify silence' :
            [notifSound && 'sound', systemNotifs && 'system', inAppNotifs && 'in-app'].filter(Boolean).join(' + ') || 'All disabled'}
        </span>
      </div>

      <div style={{ ...sectionLabel, marginTop: '24px' }}>Push Notifications (ntfy.sh)</div>
      <div style={row}>
        <span>NTFY URL</span>
        <input style={inputStyle} value={ntfyUrl} onChange={e => setNtfyUrl(e.target.value)} placeholder="http://localhost:2586" aria-label="NTFY URL" />
      </div>
      <div style={row}>
        <span>Topic</span>
        <input style={inputStyle} value={ntfyTopic} onChange={e => setNtfyTopic(e.target.value)} placeholder="mission-control" aria-label="NTFY topic" />
      </div>
      <div style={{ ...rowLast, flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={testNtfy} disabled={ntfyTesting} style={{ fontSize: '12px', padding: '8px 16px' }}>
            {ntfyTesting ? 'Sending...' : 'Test'}
          </Button>
          <Button variant="primary" onClick={() => { setNtfyStatus(null); saveNtfyMutation.mutate() }} disabled={saveNtfyMutation.isPending} style={{ fontSize: '12px', padding: '8px 16px' }}>
            {saveNtfyMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {ntfyStatus && (
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: ntfyStatus.startsWith('Error') ? 'var(--red)' : 'var(--secondary)' }}>
            {ntfyStatus}
          </span>
        )}
      </div>
    </div>
  )
}
