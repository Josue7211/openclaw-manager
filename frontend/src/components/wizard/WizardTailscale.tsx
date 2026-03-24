/**
 * WizardTailscale -- Tailscale connectivity detection step (required).
 *
 * Auto-detects via Tauri IPC `check_tailscale` when running in desktop mode.
 * Falls back to manual IP entry when running in browser mode.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { CheckCircle, XCircle, SpinnerGap } from '@phosphor-icons/react'
import {
  useWizardState,
  updateWizardField,
  markStepCompleted,
  markStepStatus,
} from '@/lib/wizard-store'
import { WizardGuidePanel } from './WizardGuidePanel'

interface TailscaleCheck {
  connected: boolean
  self_ip: string | null
  peer_count: number
  error: string | null
}

/** Shared input styling for wizard service steps */
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: '"JetBrains Mono", monospace',
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '15px',
  fontWeight: 400,
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-1)',
}

const codeStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px 6px',
  fontSize: '12px',
  fontFamily: '"JetBrains Mono", monospace',
}

const WizardTailscale = React.memo(function WizardTailscale() {
  const wizard = useWizardState()
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<TailscaleCheck | null>(null)
  const isTauri = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__

  const runCheck = useCallback(async () => {
    if (!isTauri) return
    setChecking(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<TailscaleCheck>('check_tailscale')
      setCheckResult(result)
      if (result.connected && result.self_ip) {
        updateWizardField('tailscaleIp', result.self_ip)
        markStepCompleted(1)
        markStepStatus(1, 'success')
      } else {
        markStepStatus(1, 'error')
      }
    } catch {
      setCheckResult({ connected: false, self_ip: null, peer_count: 0, error: 'Could not detect Tailscale. Is it installed?' })
      markStepStatus(1, 'error')
    } finally {
      setChecking(false)
    }
  }, [isTauri])

  // Auto-detect on mount in Tauri mode
  useEffect(() => {
    if (isTauri && !checkResult) {
      runCheck()
    }
  }, [isTauri, checkResult, runCheck])

  // Manual mode: mark success when a valid IP is entered
  const handleManualIpChange = useCallback((value: string) => {
    updateWizardField('tailscaleIp', value)
    // Simple 100.x.x.x validation for Tailscale IPs
    if (/^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value.trim())) {
      markStepCompleted(1)
      markStepStatus(1, 'success')
    } else {
      markStepStatus(1, 'idle')
    }
  }, [])

  const isConnected = checkResult?.connected || wizard.stepStatus[1] === 'success'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Connect Tailscale
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        Tailscale provides the secure network that connects all your services. It must be running on this machine.
      </p>

      <WizardGuidePanel>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Install Tailscale on this machine</li>
          <li>
            Run <code style={codeStyle}>tailscale up</code> to connect
          </li>
          <li>
            Verify with <code style={codeStyle}>tailscale status</code>
          </li>
        </ol>
      </WizardGuidePanel>

      {isTauri ? (
        /* Tauri auto-detect mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {checking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <SpinnerGap size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Detecting Tailscale...
            </div>
          )}

          {isConnected && checkResult?.self_ip && (
            <>
              <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--green)' }}>
                <CheckCircle size={16} weight="fill" />
                Tailscale connected ({checkResult.peer_count} peers)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label htmlFor="wizard-tailscale-ip" style={labelStyle}>
                  Tailscale IP (auto-detected)
                </label>
                <input
                  id="wizard-tailscale-ip"
                  type="text"
                  readOnly
                  value={wizard.tailscaleIp || checkResult.self_ip}
                  style={{ ...inputStyle, opacity: 0.8 }}
                />
              </div>
            </>
          )}

          {!checking && checkResult && !checkResult.connected && (
            <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--red-500)' }}>
                <XCircle size={16} weight="fill" />
                {checkResult.error || 'Tailscale is not connected'}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                Make sure Tailscale is installed and running. Run <code style={codeStyle}>tailscale up</code> in your terminal, then click Retry.
              </p>
              <button
                type="button"
                onClick={runCheck}
                style={{
                  alignSelf: 'flex-start',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Browser mode: manual IP entry */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-tailscale-ip" style={labelStyle}>
            Tailscale IP
          </label>
          <input
            id="wizard-tailscale-ip"
            type="text"
            value={wizard.tailscaleIp}
            onChange={e => handleManualIpChange(e.target.value)}
            placeholder="100.x.x.x"
            style={inputStyle}
          />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Running in browser mode -- auto-detection is not available. Enter your Tailscale IP manually.
          </p>
          {wizard.stepStatus[1] === 'success' && (
            <div aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--green)', marginTop: '4px' }}>
              <CheckCircle size={14} weight="fill" />
              Tailscale IP configured
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export default WizardTailscale
