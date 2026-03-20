/**
 * WizardMacServices -- BlueBubbles + Mac Bridge configuration step (optional).
 *
 * Groups two macOS-only services into collapsible cards. Shows platform
 * banner on non-macOS systems. This step is always skippable.
 */

import React, { useState, useCallback } from 'react'
import { Eye, EyeSlash, CaretDown, Info } from '@phosphor-icons/react'
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
  overflow: 'hidden',
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  width: '100%',
  padding: 'var(--space-4)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
}

const cardContentStyle: React.CSSProperties = {
  padding: '0 var(--space-4) var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

// ---------------------------------------------------------------------------
// PasswordField sub-component
// ---------------------------------------------------------------------------

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabelShow: string
  ariaLabelHide: string
}

const PasswordField = React.memo(function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  ariaLabelShow,
  ariaLabelHide,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingRight: '42px' }}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          aria-label={show ? ariaLabelHide : ariaLabelShow}
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
          {show ? <EyeSlash size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Service card sub-component
// ---------------------------------------------------------------------------

interface ServiceCardProps {
  title: string
  defaultExpanded?: boolean
  children: React.ReactNode
}

const ServiceCard = React.memo(function ServiceCard({
  title,
  defaultExpanded = true,
  children,
}: ServiceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <div style={cardStyle}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={cardHeaderStyle}
      >
        <CaretDown
          size={14}
          style={{
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 250ms var(--ease-spring)',
          }}
        />
        {title}
      </button>
      {expanded && <div style={cardContentStyle}>{children}</div>}
    </div>
  )
})

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const WizardMacServices = React.memo(function WizardMacServices() {
  const wizard = useWizardState()
  const [bbTestPassed, setBbTestPassed] = useState(false)
  const [mbTestPassed, setMbTestPassed] = useState(false)

  // Detect non-macOS
  const isMac =
    typeof navigator !== 'undefined' &&
    /mac/i.test(navigator.platform ?? navigator.userAgent ?? '')

  // Track test outcomes for step status
  const updateStepState = useCallback(
    (bbPassed: boolean, mbPassed: boolean) => {
      if (bbPassed || mbPassed) {
        markStepStatus(4, 'success')
      }
    },
    [],
  )

  const handleBbSuccess = useCallback(
    (_latencyMs: number) => {
      setBbTestPassed(true)
      updateStepState(true, mbTestPassed)
    },
    [mbTestPassed, updateStepState],
  )

  const handleMbSuccess = useCallback(
    (_latencyMs: number) => {
      setMbTestPassed(true)
      updateStepState(bbTestPassed, true)
    },
    [bbTestPassed, updateStepState],
  )

  // Mark step completed on unmount/next regardless of test results (optional step)
  // This is handled by the parent wizard shell, but we ensure skipped status
  // if nothing was configured
  React.useEffect(() => {
    return () => {
      markStepCompleted(4)
      if (!bbTestPassed && !mbTestPassed && !wizard.blueBubblesUrl && !wizard.macBridgeUrl) {
        markStepStatus(4, 'skipped')
      }
    }
    // Run only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Mac Services
      </h2>
      <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, maxWidth: '520px' }}>
        These services require a Mac running on your Tailscale network.
      </p>

      {!isMac && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-4)',
          }}
        >
          <Info size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            These services require a Mac with BlueBubbles and Mac Bridge running on your Tailscale network.
          </span>
        </div>
      )}

      {/* BlueBubbles card */}
      <ServiceCard title="BlueBubbles (iMessage)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-bb-url" style={labelStyle}>
            URL
          </label>
          <input
            id="wizard-bb-url"
            type="text"
            value={wizard.blueBubblesUrl}
            onChange={e => updateWizardField('blueBubblesUrl', e.target.value)}
            placeholder="http://100.x.x.x:1234"
            style={inputStyle}
          />
        </div>

        <PasswordField
          id="wizard-bb-password"
          label="Password"
          value={wizard.blueBubblesPassword}
          onChange={v => updateWizardField('blueBubblesPassword', v)}
          ariaLabelShow="Show password"
          ariaLabelHide="Hide password"
        />

        <WizardConnectionTest
          service="bluebubbles"
          url={wizard.blueBubblesUrl}
          credentials={{ password: wizard.blueBubblesPassword }}
          onSuccess={handleBbSuccess}
        />
      </ServiceCard>

      {/* Mac Bridge card */}
      <ServiceCard title="Mac Bridge (Reminders, Notes, Contacts)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <label htmlFor="wizard-mb-url" style={labelStyle}>
            URL
          </label>
          <input
            id="wizard-mb-url"
            type="text"
            value={wizard.macBridgeUrl}
            onChange={e => updateWizardField('macBridgeUrl', e.target.value)}
            placeholder="http://100.x.x.x:4100"
            style={inputStyle}
          />
        </div>

        <PasswordField
          id="wizard-mb-api-key"
          label="API Key"
          value={wizard.macBridgeApiKey}
          onChange={v => updateWizardField('macBridgeApiKey', v)}
          placeholder="sk-..."
          ariaLabelShow="Show API key"
          ariaLabelHide="Hide API key"
        />

        <WizardConnectionTest
          service="mac-bridge"
          url={wizard.macBridgeUrl}
          credentials={{ key: wizard.macBridgeApiKey }}
          onSuccess={handleMbSuccess}
        />
      </ServiceCard>
    </div>
  )
})
