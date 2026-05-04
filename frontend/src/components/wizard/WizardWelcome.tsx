import React, { useState, useEffect } from 'react'
import { setWizardStep, activateDemoMode, completeWizard, updateWizardField } from '@/lib/wizard-store'
import { shouldReduceMotion, shouldAnimate } from '@/lib/animation-intensity'
import { Button } from '@/components/ui/Button'
import { getSetupStatus, normalizeBackendUrl, pairWithBackend, type SetupStatus } from '@/lib/setup'
import { getConfiguredBackendBase, setApiBase, setApiKey, setConfiguredBackendBase } from '@/lib/api'

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--surface-elevated, rgba(255,255,255,0.04))',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
  borderRadius: '12px',
  color: 'var(--text-primary)',
  padding: '12px 14px',
  fontSize: '14px',
  outline: 'none',
}

// ---------------------------------------------------------------------------
// Stagger animation helper
// ---------------------------------------------------------------------------

function useStaggerVisible(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(id)
  }, [])
  return visible
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WizardWelcome({ onComplete }: { onComplete?: () => void }) {
  const visible = useStaggerVisible()
  const reduced = shouldReduceMotion()
  const noAnim = !shouldAnimate()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [backendUrl, setBackendUrl] = useState(getConfiguredBackendBase())
  const [checkedBackendUrl, setCheckedBackendUrl] = useState<string | null>(null)
  const [pairingToken, setPairingToken] = useState('')
  const [pairingBusy, setPairingBusy] = useState(false)

  // Stagger delays (ms from mount) -- only used when animations are on
  const delays = {
    logo: 0,
    heading: 400,
    subheading: 600,
    getStarted: 800,
    tryDemo: 900,
    skip: 1000,
  }

  const itemStyle = (delay: number): React.CSSProperties => {
    if (noAnim || reduced) {
      return { opacity: 1, transform: 'none' }
    }
    return {
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: `opacity 0.4s var(--ease-spring) ${delay}ms, transform 0.4s var(--ease-spring) ${delay}ms`,
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadStatus(baseUrl = backendUrl) {
      try {
        const normalized = normalizeBackendUrl(baseUrl)
        const next = await getSetupStatus(normalized)
        if (cancelled) return
        setStatus(next)
        const resolvedBase = normalizeBackendUrl(next.backend_public_base_url || normalized)
        setCheckedBackendUrl(resolvedBase)
        setBackendUrl(resolvedBase)
        updateWizardField('backendUrl', next.backend_public_base_url)
      } catch (error) {
        if (cancelled) return
        setBackendError(error instanceof Error ? error.message : 'Unable to reach backend')
        setStatus(null)
        setCheckedBackendUrl(null)
      } finally {
        if (!cancelled) setLoadingStatus(false)
      }
    }

    updateWizardField('backendUrl', backendUrl)
    void loadStatus(backendUrl)
    return () => { cancelled = true }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-16, 64px) var(--space-6, 24px)',
        gap: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          position: 'relative',
          width: 80,
          height: 80,
          marginBottom: 'var(--space-6, 24px)',
          ...itemStyle(delays.logo),
        }}
      >
        {/* Glow halo */}
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: 'var(--radius-full)',
            animation:
              !noAnim && !reduced
                ? 'logo-glow 1.2s var(--ease-out) 0.3s forwards'
                : undefined,
          }}
        />
        {/* Logo image */}
        <img
          src="/logo-128.png"
          alt="ClawControl logo"
          width={80}
          height={80}
          style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--radius-full)',
            position: 'relative',
            zIndex: 1,
            animation:
              !noAnim && !reduced
                ? 'logo-reveal 0.8s var(--ease-spring) forwards'
                : undefined,
            // If reduced or none, just show at full opacity
            ...((noAnim || reduced) ? { opacity: 1, clipPath: 'none', filter: 'none' } : {}),
          }}
        />
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize: 'var(--text-2xl, 24px)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: 0,
          marginBottom: 'var(--space-2, 8px)',
          lineHeight: 1.2,
          animation: 'none',
          ...itemStyle(delays.heading),
        }}
      >
        Welcome to ClawControl
      </h1>

      {/* Subheading */}
      <p
        style={{
          fontSize: 'var(--text-base, 15px)',
          fontWeight: 400,
          color: 'var(--text-secondary)',
          margin: 0,
          maxWidth: 480,
          lineHeight: 1.5,
          marginBottom: 'var(--space-8, 32px)',
          ...itemStyle(delays.subheading),
        }}
      >
        Your personal command center for messages, tasks, agents, and more.
        Let's get you set up in a few minutes.
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: 520,
          marginBottom: 'var(--space-8, 32px)',
          padding: '16px',
          borderRadius: '16px',
          background: 'var(--surface-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          ...itemStyle(delays.subheading + 80),
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Backend-first setup
        </div>
        {loadingStatus && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Checking backend status...
          </div>
        )}
        {!loadingStatus && backendError && (
          <div style={{ fontSize: 13, color: 'var(--danger, #ef4444)' }}>
            {backendError}
          </div>
        )}
        {!loadingStatus && status && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Backend URL
            </div>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => {
                const value = e.target.value
                setBackendUrl(value)
                updateWizardField('backendUrl', value)
              }}
              placeholder="http://your-backend-host:3000"
              style={inputStyle}
            />
            <Button
              variant="ghost"
              onClick={async () => {
                setLoadingStatus(true)
                setBackendError(null)
                try {
                  const normalized = normalizeBackendUrl(backendUrl)
                  const next = await getSetupStatus(normalized)
                  setStatus(next)
                  const resolvedBase = normalizeBackendUrl(next.backend_public_base_url || normalized)
                  setCheckedBackendUrl(resolvedBase)
                  setBackendUrl(resolvedBase)
                  updateWizardField('backendUrl', next.backend_public_base_url)
                } catch (error) {
                  setStatus(null)
                  setCheckedBackendUrl(null)
                  setBackendError(error instanceof Error ? error.message : 'Unable to reach backend')
                } finally {
                  setLoadingStatus(false)
                }
              }}
              style={{ alignSelf: 'center' }}
            >
              Check Backend
            </Button>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Core services:
              {' '}
              Supabase {status.services.supabase.reachable ? 'online' : 'offline'}
              {' · '}
              Harness {(status.services.harness ?? status.services.openclaw).reachable ? 'online' : 'offline'}
              {' · '}
              MemD {status.services.memd.reachable ? 'online' : 'offline'}
            </div>
            {status.pairing_required && (
              <>
                <input
                  type="password"
                  value={pairingToken}
                  onChange={(e) => {
                    const value = e.target.value
                    setPairingToken(value)
                    updateWizardField('pairingToken', value)
                  }}
                  placeholder="Pairing token"
                  style={inputStyle}
                />
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const normalized = normalizeBackendUrl(backendUrl)
                    setPairingBusy(true)
                    setBackendError(null)
                  try {
                      const result = await pairWithBackend(pairingToken, 'ClawControl desktop', normalized)
                      if (window.__TAURI_INTERNALS__ && result.device_api_key) {
                        const { invoke } = await import('@tauri-apps/api/core')
                        await invoke('set_secret', { key: 'backend.device-api-key', value: result.device_api_key })
                      }
                      setConfiguredBackendBase(normalized)
                      setApiBase(normalized)
                      if (result.device_api_key?.trim()) {
                        setApiKey(result.device_api_key)
                        const { setChatSocketApiKey } = await import('@/lib/hooks/useChatSocket')
                        setChatSocketApiKey(result.device_api_key)
                      }
                      updateWizardField('backendUrl', normalized)
                      updateWizardField('pairingToken', '')
                      completeWizard()
                      onComplete?.()
                    } catch (error) {
                      setBackendError(error instanceof Error ? error.message : 'Pairing failed')
                    } finally {
                      setPairingBusy(false)
                    }
                  }}
                  disabled={!pairingToken.trim() || pairingBusy}
                  style={{ minWidth: 180, alignSelf: 'center' }}
                >
                  {pairingBusy ? 'Pairing...' : 'Pair With Backend'}
                </Button>
              </>
            )}
            {!status.pairing_required && status.services.supabase.reachable && (
              <Button
                variant="secondary"
                onClick={() => {
                  const nextBase = checkedBackendUrl || normalizeBackendUrl(backendUrl)
                  setConfiguredBackendBase(nextBase)
                  setApiBase(nextBase)
                  updateWizardField('backendUrl', nextBase)
                  completeWizard()
                  onComplete?.()
                }}
                style={{ minWidth: 220, alignSelf: 'center' }}
              >
                Use Current Backend
              </Button>
            )}
          </>
        )}
      </div>

      {/* Get Started */}
      <div style={{ marginBottom: 'var(--space-2, 8px)', ...itemStyle(delays.getStarted) }}>
        <Button
          variant="primary"
          onClick={() => setWizardStep(1)}
          style={{ minWidth: 180, fontSize: 'var(--text-base, 15px)' }}
        >
          Get Started
        </Button>
      </div>

      {/* Try Demo */}
      <div style={{ marginBottom: 'var(--space-4, 16px)', ...itemStyle(delays.tryDemo) }}>
        <Button
          variant="ghost"
          onClick={() => { activateDemoMode(); completeWizard(); onComplete?.() }}
          aria-label="Enter demo mode with sample data"
          style={{ color: 'var(--text-secondary)' }}
        >
          Try Demo
        </Button>
      </div>

      {/* Skip setup link */}
      <div style={itemStyle(delays.skip)}>
        <button
          type="button"
          onClick={() => { completeWizard(); onComplete?.() }}
          aria-label="Skip setup wizard and configure later in Settings"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-muted)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm, 6px)',
            fontFamily: 'inherit',
            transition: 'color 0.15s ease',
          }}
        >
          Skip setup -- I'll configure later
        </button>
      </div>
    </div>
  )
}
