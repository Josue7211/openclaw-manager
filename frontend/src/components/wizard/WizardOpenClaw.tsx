/**
 * WizardOpenClaw -- OpenClaw URL + API key connection step (required).
 *
 * Tests connectivity via POST /api/wizard/test-connection with service="openclaw".
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

export const WizardOpenClaw = React.memo(function WizardOpenClaw() {
  const wizard = useWizardState()
  const [showKey, setShowKey] = useState(false)

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('openclawUrl', e.target.value)
  }, [])

  const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('openclawApiKey', e.target.value)
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
        Connect OpenClaw
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        The AI gateway that powers Chat, Agents, and Mission Control's intelligence.
      </p>

      <WizardGuidePanel>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Deploy OpenClaw on a VM accessible via Tailscale</li>
          <li>Note the API URL (e.g. http://100.x.x.x:18789)</li>
          <li>Generate an API key from the OpenClaw admin panel</li>
          <li>Make sure the gateway is reachable over your Tailscale network</li>
        </ol>
      </WizardGuidePanel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-openclaw-url" style={labelStyle}>
          OpenClaw URL
        </label>
        <input
          id="wizard-openclaw-url"
          type="url"
          value={wizard.openclawUrl}
          onChange={handleUrlChange}
          placeholder="https://openclaw.example.com"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-openclaw-api-key" style={labelStyle}>
          API Key
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="wizard-openclaw-api-key"
            type={showKey ? 'text' : 'password'}
            value={wizard.openclawApiKey}
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
        service="openclaw"
        url={wizard.openclawUrl}
        credentials={{ key: wizard.openclawApiKey }}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  )
})
