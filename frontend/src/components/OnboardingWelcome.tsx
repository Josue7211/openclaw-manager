import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, SkipForward, Database, MessageSquare, Bot, Rocket } from 'lucide-react'
import { api } from '@/lib/api'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useEscapeKey } from '@/lib/hooks/useEscapeKey'

const STORAGE_KEY = 'setup-complete'

// ── Shared styles ──

const wizardInput: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  fontSize: '13px',
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  outline: 'none',
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: '10px',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--text-on-color)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'filter 0.15s ease',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  fontWeight: 500,
}

const skipBtn: React.CSSProperties = {
  ...secondaryBtn,
  border: 'none',
  fontSize: '12px',
  color: 'var(--text-muted)',
  padding: '8px 12px',
}

const TOTAL_STEPS = 5

type TestStatus = 'idle' | 'testing' | 'ok' | 'error'

interface StepProps {
  onNext: () => void
  onBack: () => void
}

// ── Step 1: Welcome ──

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
      <img
        src="/logo-128.png"
        alt="Mission Control"
        width={72}
        height={72}
        style={{ borderRadius: '18px' }}
      />
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          margin: 0, fontSize: '22px', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>
          Welcome to Mission Control
        </h2>
        <p style={{
          margin: '10px 0 0', fontSize: '13px',
          color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '340px',
        }}>
          Your personal command center for messages, tasks, and AI chat.
          Let's connect your services so everything works together.
        </p>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '6px', width: '100%',
        padding: '12px 16px', borderRadius: '12px',
        background: 'var(--bg-white-03)', border: '1px solid var(--bg-white-04)',
      }}>
        <SetupFeature icon={Database} title="Supabase" desc="Database and authentication (required)" />
        <SetupFeature icon={Bot} title="OpenClaw" desc="AI agent workspace (required)" />
        <SetupFeature icon={MessageSquare} title="BlueBubbles" desc="iMessage bridge (optional, Mac only)" />
      </div>
      <button
        onClick={onNext}
        autoFocus
        style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: '4px' }}
        className="hover-bg-bright"
      >
        Let's Go <ChevronRight size={16} />
      </button>
    </div>
  )
}

function SetupFeature({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
      <div style={{
        width: '30px', height: '30px', borderRadius: '8px',
        background: 'var(--purple-a10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={14} style={{ color: 'var(--accent)' }} />
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  )
}

// ── Step 2: Supabase ──

function StepSupabase({ onNext, onBack }: StepProps) {
  const [url, setUrl] = useState(import.meta.env.VITE_SUPABASE_URL || '')
  const [anonKey, setAnonKey] = useState(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const testConnection = useCallback(async () => {
    setTestStatus('testing')
    setErrorMsg('')
    try {
      // Try to reach the Supabase REST API health endpoint
      const testUrl = url.replace(/\/+$/, '')
      const res = await fetch(`${testUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok || res.status === 200 || res.status === 404) {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setErrorMsg(`HTTP ${res.status}`)
      }
    } catch (e) {
      setTestStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [url, anonKey])

  const handleNext = () => {
    // If Supabase values are already set from env, just proceed
    onNext()
  }

  const envConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          <Database size={16} style={{ verticalAlign: '-2px', marginRight: '8px', color: 'var(--accent)' }} />
          Supabase
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Supabase provides the database and authentication backend.
          {envConfigured && ' Your environment already has Supabase configured.'}
        </p>
      </div>

      {envConfigured ? (
        <div style={{
          padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)',
          fontSize: '12px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <CheckCircle size={14} />
          Configured via environment variables
        </div>
      ) : (
        <>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Supabase URL
            </label>
            <input
              style={wizardInput}
              value={url}
              onChange={e => { setUrl(e.target.value); setTestStatus('idle') }}
              placeholder="https://your-project.supabase.co"
              aria-label="Supabase URL"
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
              Anon Key
            </label>
            <input
              style={wizardInput}
              value={anonKey}
              onChange={e => { setAnonKey(e.target.value); setTestStatus('idle') }}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              type="password"
              aria-label="Supabase anon key"
            />
          </div>
        </>
      )}

      <TestResult status={testStatus} errorMsg={errorMsg} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!envConfigured && (
            <button
              onClick={testConnection}
              disabled={!url || !anonKey || testStatus === 'testing'}
              style={{ ...secondaryBtn, opacity: (!url || !anonKey) ? 0.5 : 1 }}
            >
              {testStatus === 'testing' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test Connection'}
            </button>
          )}
          <button onClick={handleNext} style={primaryBtn}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {false && (
        <button onClick={onNext} style={{ ...skipBtn, alignSelf: 'center' }}>
          <SkipForward size={12} /> Skip for now
        </button>
      )}
    </div>
  )
}

// ── Step 3: BlueBubbles ──

function StepBlueBubbles({ onNext, onBack }: StepProps) {
  const [url, setUrl] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Load existing value from keychain
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string | null>('get_secret', { key: 'bluebubbles.host' })
        .then(v => { if (v) setUrl(v) })
        .catch(() => {})
    })
  }, [])

  const testConnection = useCallback(async () => {
    setTestStatus('testing')
    setErrorMsg('')
    try {
      const data = await api.get<Record<string, { status: string; latency_ms?: number; error?: string }>>('/api/status/connections')
      if (data?.bluebubbles?.status === 'ok') {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setErrorMsg(data?.bluebubbles?.error || 'Not connected')
      }
    } catch (e) {
      setTestStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection test failed')
    }
  }, [])

  const saveAndNext = useCallback(async () => {
    if (url && window.__TAURI_INTERNALS__) {
      setSaving(true)
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'bluebubbles.host', value: url })
      } catch (e) {
        console.warn('Failed to save BlueBubbles URL:', e)
      } finally {
        setSaving(false)
      }
    }
    onNext()
  }, [url, onNext])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          <MessageSquare size={16} style={{ verticalAlign: '-2px', marginRight: '8px', color: 'var(--accent)' }} />
          BlueBubbles
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          BlueBubbles bridges iMessage to Mission Control. Requires a Mac running the BlueBubbles server.
        </p>
      </div>

      <div>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
          BlueBubbles Server URL
        </label>
        <input
          style={wizardInput}
          value={url}
          onChange={e => { setUrl(e.target.value); setTestStatus('idle') }}
          placeholder="http://your-mac-ip:1234"
          aria-label="BlueBubbles URL"
        />
      </div>

      <TestResult status={testStatus} errorMsg={errorMsg} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {url && (
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing'}
              style={secondaryBtn}
            >
              {testStatus === 'testing' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test'}
            </button>
          )}
          <button onClick={saveAndNext} disabled={saving} style={primaryBtn}>
            {saving ? 'Saving...' : 'Next'} {!saving && <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      <button onClick={() => onNext()} style={{ ...skipBtn, alignSelf: 'center' }}>
        <SkipForward size={12} /> Skip — I don't have a Mac
      </button>
    </div>
  )
}

// ── Step 4: OpenClaw ──

function StepOpenClaw({ onNext, onBack }: StepProps) {
  const [url, setUrl] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Load existing value from keychain
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string | null>('get_secret', { key: 'openclaw.api-url' })
        .then(v => { if (v) setUrl(v) })
        .catch(() => {})
    })
  }, [])

  const testConnection = useCallback(async () => {
    setTestStatus('testing')
    setErrorMsg('')
    try {
      const data = await api.get<Record<string, { status: string; latency_ms?: number; error?: string }>>('/api/status/connections')
      if (data?.openclaw?.status === 'ok') {
        setTestStatus('ok')
      } else {
        setTestStatus('error')
        setErrorMsg(data?.openclaw?.error || 'Not connected')
      }
    } catch (e) {
      setTestStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Connection test failed')
    }
  }, [])

  const saveAndNext = useCallback(async () => {
    if (url && window.__TAURI_INTERNALS__) {
      setSaving(true)
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_secret', { key: 'openclaw.api-url', value: url })
      } catch (e) {
        console.warn('Failed to save OpenClaw URL:', e)
      } finally {
        setSaving(false)
      }
    }
    onNext()
  }, [url, onNext])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          <Bot size={16} style={{ verticalAlign: '-2px', marginRight: '8px', color: 'var(--accent)' }} />
          OpenClaw
        </h3>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          OpenClaw is the remote AI workspace that powers chat sessions and agent tasks.
        </p>
      </div>

      <div>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
          OpenClaw API URL
        </label>
        <input
          style={wizardInput}
          value={url}
          onChange={e => { setUrl(e.target.value); setTestStatus('idle') }}
          placeholder="http://your-openclaw-host:18789"
          aria-label="OpenClaw API URL"
        />
      </div>

      <TestResult status={testStatus} errorMsg={errorMsg} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
        <button onClick={onBack} style={secondaryBtn}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {url && (
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing'}
              style={secondaryBtn}
            >
              {testStatus === 'testing' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test'}
            </button>
          )}
          <button onClick={saveAndNext} disabled={saving} style={primaryBtn}>
            {saving ? 'Saving...' : 'Next'} {!saving && <ChevronRight size={14} />}
          </button>
        </div>
      </div>

    </div>
  )
}

// ── Step 5: Done ──

function StepDone({ onFinish }: { onFinish: () => void }) {
  const [supabaseOk, setSupabaseOk] = useState(false)
  const [bbOk, setBbOk] = useState(false)
  const [ocOk, setOcOk] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Check what's connected
    const checkAll = async () => {
      // Supabase — check env vars
      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        setSupabaseOk(true)
      }

      // BlueBubbles & OpenClaw — check keychain or env vars
      if (window.__TAURI_INTERNALS__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const bb = await invoke<string | null>('get_secret', { key: 'bluebubbles.host' })
          if (bb) setBbOk(true)
          const oc = await invoke<string | null>('get_secret', { key: 'openclaw.api-url' })
          if (oc) setOcOk(true)
        } catch { /* */ }
      }
      // Fallback: check if services respond (works in browser dev mode)
      if (!ocOk) {
        try {
          const res = await fetch('http://127.0.0.1:3000/api/status', { signal: AbortSignal.timeout(3000) })
          if (res.ok) setOcOk(true)
        } catch { /* */ }
      }
      if (!bbOk) {
        try {
          const res = await fetch('http://127.0.0.1:3000/api/messages?limit=0', { signal: AbortSignal.timeout(3000), headers: { 'Origin': window.location.origin } })
          if (res.ok) setBbOk(true)
        } catch { /* */ }
      }

      setChecking(false)
    }
    checkAll()
  }, [])

  const connectedCount = [supabaseOk, bbOk, ocOk].filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
      <div style={{
        width: '64px', height: '64px', borderRadius: '50%',
        background: 'rgba(52,211,153,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Rocket size={28} style={{ color: 'var(--green)' }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
          You're all set!
        </h3>
        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {connectedCount === 0 && 'No services configured yet. You can set them up later in Settings.'}
          {connectedCount === 1 && '1 service configured.'}
          {connectedCount === 2 && '2 services configured.'}
          {connectedCount === 3 && 'All services configured!'}
        </p>
      </div>

      {!checking && (
        <div style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: '6px',
          padding: '12px 16px', borderRadius: '12px',
          background: 'var(--bg-white-03)', border: '1px solid var(--bg-white-04)',
        }}>
          <ConnectionSummaryRow label="Supabase" connected={supabaseOk} />
          <ConnectionSummaryRow label="BlueBubbles" connected={bbOk} />
          <ConnectionSummaryRow label="OpenClaw" connected={ocOk} />
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
        You can reconfigure connections anytime in Settings.
      </p>

      <button
        onClick={onFinish}
        autoFocus
        style={{ ...primaryBtn, width: '100%', justifyContent: 'center', marginTop: '4px' }}
      >
        Get Started
      </button>
    </div>
  )
}

function ConnectionSummaryRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{
        fontSize: '11px', fontFamily: 'monospace',
        color: connected ? 'var(--green)' : 'var(--text-muted)',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: connected ? 'var(--green)' : 'var(--bg-white-15)',
          display: 'inline-block',
        }} />
        {connected ? 'Configured' : 'Skipped'}
      </span>
    </div>
  )
}

// ── Test result badge ──

function TestResult({ status, errorMsg }: { status: TestStatus; errorMsg: string }) {
  if (status === 'idle') return null
  if (status === 'testing') return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.12)',
      color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
      Testing connection...
    </div>
  )
  if (status === 'ok') return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)',
      color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '6px',
    }}>
      <CheckCircle size={12} />
      Connection successful
    </div>
  )
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
      background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.15)',
      color: 'var(--red)', lineHeight: 1.4,
    }}>
      Connection failed{errorMsg ? `: ${errorMsg}` : ''}
    </div>
  )
}

// ── Progress dots ──

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: current === i ? '20px' : '6px',
            height: '6px',
            borderRadius: '3px',
            background: current === i ? 'var(--accent)' : 'var(--bg-white-15)',
            transition: 'all 0.3s var(--ease-spring)',
          }}
        />
      ))}
    </div>
  )
}

// ── Main wizard ──

export default function OnboardingWelcome({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (forceOpen) {
      setVisible(true)
      setStep(0)
    } else if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
    setMounted(true)
  }, [forceOpen])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
    onClose?.()
  }, [onClose])

  const trapRef = useFocusTrap(visible)
  useEscapeKey(dismiss, visible)

  if (!visible || !mounted) return null

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  const renderStep = () => {
    switch (step) {
      case 0: return <StepWelcome onNext={next} />
      case 1: return <StepSupabase onNext={next} onBack={back} />
      case 2: return <StepBlueBubbles onNext={next} onBack={back} />
      case 3: return <StepOpenClaw onNext={next} onBack={back} />
      case 4: return <StepDone onFinish={dismiss} />
      default: return null
    }
  }

  return createPortal(
    <>
      <style>{`
        @keyframes ob-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ob-scalein {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      <div
        onClick={step === 0 ? dismiss : undefined}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--overlay-heavy)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 'var(--z-modal-backdrop)' as React.CSSProperties['zIndex'],
          animation: 'ob-fadein 0.2s ease',
        }}
      />

      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '480px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: 'rgba(18, 18, 24, 0.97)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid var(--hover-bg-bright)',
          borderRadius: '20px',
          boxShadow:
            '0 32px 100px var(--overlay-heavy), 0 0 0 1px var(--bg-white-04)',
          zIndex: 'var(--z-modal)' as React.CSSProperties['zIndex'],
          animation: 'ob-scalein 0.25s var(--ease-spring)',
        }}
      >
        {/* Step label */}
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <div style={{
            padding: '16px 28px 0', fontSize: '11px',
            color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Step {step} of {TOTAL_STEPS - 2}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '24px 28px 16px' }}>
          {renderStep()}
        </div>

        {/* Progress dots */}
        <div style={{ padding: '0 28px 20px' }}>
          <ProgressDots current={step} total={TOTAL_STEPS} />
        </div>
      </div>
    </>,
    document.body,
  )
}

/** Reset setup completion flag — used by Settings "Re-run Setup" button */
export function resetSetupWizard() {
  localStorage.removeItem(STORAGE_KEY)
}
