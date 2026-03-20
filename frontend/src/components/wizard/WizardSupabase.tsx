/**
 * WizardSupabase -- Supabase URL + anon key connection step (required).
 *
 * Tests connectivity via POST /api/wizard/test-connection with service="supabase".
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

export const WizardSupabase = React.memo(function WizardSupabase() {
  const wizard = useWizardState()
  const [showKey, setShowKey] = useState(false)

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('supabaseUrl', e.target.value)
  }, [])

  const handleKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateWizardField('supabaseAnonKey', e.target.value)
  }, [])

  const handleSuccess = useCallback((latencyMs: number) => {
    markStepCompleted(2)
    markStepStatus(2, 'success')
    void latencyMs
  }, [])

  const handleError = useCallback(() => {
    markStepStatus(2, 'error')
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Connect Supabase
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        Your self-hosted PostgreSQL database and authentication backend.
      </p>

      <WizardGuidePanel>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Set up a self-hosted Supabase instance (Docker recommended)</li>
          <li>Note the dashboard URL (e.g. https://supabase.example.com)</li>
          <li>Find your anon key in Settings &gt; API in the Supabase dashboard</li>
          <li>Make sure the instance is reachable over your Tailscale network</li>
        </ol>
      </WizardGuidePanel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-supabase-url" style={labelStyle}>
          Supabase URL
        </label>
        <input
          id="wizard-supabase-url"
          type="url"
          value={wizard.supabaseUrl}
          onChange={handleUrlChange}
          placeholder="https://supabase.example.com"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label htmlFor="wizard-supabase-anon-key" style={labelStyle}>
          Anon Key
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="wizard-supabase-anon-key"
            type={showKey ? 'text' : 'password'}
            value={wizard.supabaseAnonKey}
            onChange={handleKeyChange}
            placeholder="eyJhbGciOiJI..."
            style={{ ...inputStyle, paddingRight: '42px' }}
          />
          <button
            type="button"
            onClick={() => setShowKey(s => !s)}
            aria-label={showKey ? 'Hide anon key' : 'Show anon key'}
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
        service="supabase"
        url={wizard.supabaseUrl}
        credentials={{ key: wizard.supabaseAnonKey }}
        onSuccess={handleSuccess}
        onError={handleError}
      />
    </div>
  )
})
