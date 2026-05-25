/**
 * Hermes Agent connection step (required).
 *
 * Tests connectivity via POST /api/wizard/test-connection with service="harness".
 * Secret field has show/hide toggle with Eye/EyeSlash icons.
 */

import React, { useState, useCallback } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import {
  useWizardState,
  updateWizardField,
  markStepCompleted,
  markStepStatus,
} from '@/lib/wizard-store'
import { WizardGuidePanel } from './WizardGuidePanel'
import { WizardConnectionTest } from './WizardConnectionTest'

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

const WizardHarness = React.memo(function WizardHarness() {
  const wizard = useWizardState()
  const [showKey, setShowKey] = useState(false)
  const [showCodexPassword, setShowCodexPassword] = useState(false)

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('harnessUrl', e.target.value)
  }, [])

  const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('harnessApiKey', e.target.value)
  }, [])

  const handleCodexUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('codexLbUrl', e.target.value)
  }, [])

  const handleCodexPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('codexLbDashboardPassword', e.target.value)
  }, [])

  const handleSuccess = useCallback((latencyMs: number) => {
    markStepCompleted(3)
    markStepStatus(3, 'success')
    void latencyMs
  }, [])

  const handleError = useCallback(() => {
    markStepStatus(3, 'error')
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Connect Hermes Agent
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        Hermes Agent powers Chat, Agents, approvals, usage, and tools.
      </p>

      <WizardGuidePanel>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Deploy Hermes Agent on a host accessible via Tailscale</li>
          <li>Note the API URL (e.g. http://100.x.x.x:18789)</li>
          <li>Generate or copy the API key for Hermes Agent</li>
          <li>Make sure it is reachable over your Tailscale network</li>
        </ol>
      </WizardGuidePanel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-harness-url" style={labelStyle}>
          Hermes Agent URL
        </label>
        <input
          id="wizard-harness-url"
          type="url"
          value={wizard.harnessUrl}
          onChange={handleUrlChange}
          placeholder="http://100.x.x.x:18789"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-harness-api-key" style={labelStyle}>
          API Key
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="wizard-harness-api-key"
            type={showKey ? 'text' : 'password'}
            value={wizard.harnessApiKey}
            onChange={handleKeyChange}
            placeholder="sk-..."
            style={{ ...inputStyle, paddingRight: '42px' }}
          />
          <button
            type="button"
            onClick={() => setShowKey(s => !s)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {showKey ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <WizardConnectionTest
        service="harness"
        url={wizard.harnessUrl}
        credentials={{ key: wizard.harnessApiKey }}
        onSuccess={handleSuccess}
        onError={handleError}
      />

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>
            Hermes Agent Dashboard
          </h3>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Used for accounts, API keys, request logs, and limit data inside clawctrl.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-codex-lb-url" style={labelStyle}>
            Dashboard URL
          </label>
          <input
            id="wizard-codex-lb-url"
            type="url"
            value={wizard.codexLbUrl}
            onChange={handleCodexUrlChange}
            placeholder="http://127.0.0.1:2455"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-codex-lb-password" style={labelStyle}>
            Dashboard Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="wizard-codex-lb-password"
              type={showCodexPassword ? 'text' : 'password'}
              value={wizard.codexLbDashboardPassword}
              onChange={handleCodexPasswordChange}
              placeholder="Dashboard password"
              style={{ ...inputStyle, paddingRight: '42px' }}
            />
            <button
              type="button"
              onClick={() => setShowCodexPassword(s => !s)}
              aria-label={showCodexPassword ? 'Hide Hermes Agent password' : 'Show Hermes Agent password'}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showCodexPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

export default WizardHarness
