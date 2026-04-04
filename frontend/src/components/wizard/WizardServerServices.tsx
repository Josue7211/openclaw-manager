/**
 * WizardServerServices -- CouchDB configuration step (optional).
 *
 * Single service card for Obsidian Notes Sync via CouchDB.
 * This step is always skippable.
 */

import React, { useState, useCallback } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import {
  useWizardState,
  updateWizardField,
  markStepCompleted,
  markStepStatus,
} from '@/lib/wizard-store'
import { WizardConnectionTest } from './WizardConnectionTest'

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

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

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const WizardServerServices = React.memo(function WizardServerServices() {
  const wizard = useWizardState()
  const [showPassword, setShowPassword] = useState(false)
  const [testPassed, setTestPassed] = useState(false)

  const handleSuccess = useCallback((_latencyMs: number) => {
    setTestPassed(true)
    markStepStatus(5, 'success')
  }, [])

  // Mark step completed on unmount/next regardless of test results (optional step)
  React.useEffect(() => {
    return () => {
      markStepCompleted(5)
      if (!testPassed && !wizard.couchdbUrl) {
        markStepStatus(5, 'skipped')
      }
    }
    // Run only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Server Services
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        Optional services running on your infrastructure.
      </p>

      {/* CouchDB card */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          CouchDB (Obsidian Notes Sync)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-couchdb-url" style={labelStyle}>
            URL
          </label>
          <input
            id="wizard-couchdb-url"
            type="text"
            value={wizard.couchdbUrl}
            onChange={e => updateWizardField('couchdbUrl', e.target.value)}
            placeholder="http://100.x.x.x:5984"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-couchdb-username" style={labelStyle}>
            Username
          </label>
          <input
            id="wizard-couchdb-username"
            type="text"
            value={wizard.couchdbUsername}
            onChange={e => updateWizardField('couchdbUsername', e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-couchdb-password" style={labelStyle}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="wizard-couchdb-password"
              type={showPassword ? 'text' : 'password'}
              value={wizard.couchdbPassword}
              onChange={e => updateWizardField('couchdbPassword', e.target.value)}
              style={{ ...inputStyle, paddingRight: '42px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
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
              {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <WizardConnectionTest
          service="couchdb"
          url={wizard.couchdbUrl}
          credentials={{
            username: wizard.couchdbUsername,
            password: wizard.couchdbPassword,
          }}
          onSuccess={handleSuccess}
        />
      </div>
    </div>
  )
})

export default WizardServerServices
