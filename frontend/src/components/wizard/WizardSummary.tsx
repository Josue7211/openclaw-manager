/**
 * WizardSummary -- Configuration recap with confetti celebration.
 *
 * Shows three summary cards: Services, Modules, Theme.
 * Fires confetti on mount (respects animation intensity).
 * "Launch Dashboard" and "Take a Quick Tour" buttons trigger completion.
 */

import React, { useEffect } from 'react'
import confetti from 'canvas-confetti'
import { CheckCircle, MinusCircle, XCircle } from '@phosphor-icons/react'
import { useWizardState } from '@/lib/wizard-store'
import { APP_MODULES } from '@/lib/modules'
import { BUILT_IN_THEMES } from '@/lib/theme-definitions'
import { shouldAnimate, shouldReduceMotion } from '@/lib/animation-intensity'

// ---------------------------------------------------------------------------
// Service definitions for summary display
// ---------------------------------------------------------------------------

interface ServiceSummary {
  key: string
  name: string
  stepIndex: number
}

const SERVICES: ServiceSummary[] = [
  { key: 'tailscale', name: 'Tailscale', stepIndex: 1 },
  { key: 'supabase', name: 'Supabase', stepIndex: 2 },
  { key: 'openclaw', name: 'OpenClaw', stepIndex: 3 },
  { key: 'bluebubbles', name: 'BlueBubbles', stepIndex: 4 },
  { key: 'mac-bridge', name: 'Mac Bridge', stepIndex: 4 },
  { key: 'couchdb', name: 'CouchDB', stepIndex: 5 },
]

// ---------------------------------------------------------------------------
// Service status helpers
// ---------------------------------------------------------------------------

type ServiceStatus = 'connected' | 'skipped' | 'failed'

function getServiceStatus(
  key: string,
  stepIndex: number,
  testResults: Record<string, { status: string; latencyMs?: number }>,
  stepStatus: Record<number, string>,
): { status: ServiceStatus; latencyMs?: number } {
  const test = testResults[key]
  if (test?.status === 'success') {
    return { status: 'connected', latencyMs: test.latencyMs }
  }
  if (test?.status === 'error') {
    return { status: 'failed' }
  }
  // If the step was skipped or not attempted
  if (stepStatus[stepIndex] === 'skipped') {
    return { status: 'skipped' }
  }
  return { status: 'skipped' }
}

function StatusIcon({ status }: { status: ServiceStatus }) {
  switch (status) {
    case 'connected':
      return <CheckCircle size={18} weight="fill" style={{ color: 'var(--green)', flexShrink: 0 }} aria-label="Connected" />
    case 'skipped':
      return <MinusCircle size={18} weight="regular" style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-label="Skipped" />
    case 'failed':
      return <XCircle size={18} weight="fill" style={{ color: 'var(--red-500)', flexShrink: 0 }} aria-label="Failed" />
  }
}

function statusText(status: ServiceStatus, latencyMs?: number): string {
  switch (status) {
    case 'connected':
      return latencyMs !== undefined ? `Connected (${latencyMs}ms)` : 'Connected'
    case 'skipped':
      return 'Skipped'
    case 'failed':
      return 'Failed'
  }
}

function statusColor(status: ServiceStatus): string {
  switch (status) {
    case 'connected': return 'var(--green)'
    case 'skipped': return 'var(--text-muted)'
    case 'failed': return 'var(--red-500)'
  }
}

// ---------------------------------------------------------------------------
// Summary card wrapper
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: 'var(--space-4, 16px)',
}

const cardHeader: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: '12px',
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface WizardSummaryProps {
  onLaunch: () => void
  onTour: () => void
}

export default function WizardSummary({ onLaunch, onTour }: WizardSummaryProps) {
  const wizard = useWizardState()

  // Fire confetti on mount
  useEffect(() => {
    if (shouldAnimate()) {
      const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim()
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.5, y: 0.3 },
        colors: [accentColor || '#7c5bf5', '#34d399', '#60a5fa', '#f472b6'],
        gravity: 1.2,
        ticks: 200,
        disableForReducedMotion: true,
      })
    }
  }, [])

  // Module summary
  const enabledModules = wizard.enabledModules
  const enabledNames = enabledModules
    .map(id => APP_MODULES.find(m => m.id === id)?.name)
    .filter(Boolean) as string[]
  const modulesSummary =
    enabledNames.length <= 6
      ? enabledNames.join(', ')
      : `${enabledNames.slice(0, 6).join(', ')}...and ${enabledNames.length - 6} more`

  // Theme summary
  const themeDef = BUILT_IN_THEMES.find(t => t.id === wizard.selectedThemeId)
  const themeName = themeDef?.name || wizard.selectedThemeId
  const modeLabel = wizard.selectedMode === 'system'
    ? 'System'
    : wizard.selectedMode === 'light'
      ? 'Light mode'
      : 'Dark mode'

  const headingAnimation: React.CSSProperties = shouldReduceMotion()
    ? {}
    : {
        animation: 'wizard-summary-entrance 0.5s var(--ease-spring) both',
      }

  return (
    <div style={{ width: '100%' }}>
      {/* Inline keyframes for heading entrance */}
      <style>{`
        @keyframes wizard-summary-entrance {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Heading */}
      <h2
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 4px',
          ...headingAnimation,
        }}
      >
        You're all set!
      </h2>
      <p
        style={{
          fontSize: '15px',
          color: 'var(--text-secondary)',
          margin: '0 0 var(--space-6, 24px)',
        }}
      >
        Here's what we configured:
      </p>

      {/* Summary cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
        {/* Services card */}
        <div style={cardStyle}>
          <div style={cardHeader}>Services</div>
          <div role="list">
            {SERVICES.map(({ key, name, stepIndex }) => {
              const { status, latencyMs } = getServiceStatus(
                key,
                stepIndex,
                wizard.testResults as Record<string, { status: string; latencyMs?: number }>,
                wizard.stepStatus as Record<number, string>,
              )
              return (
                <div
                  key={key}
                  role="listitem"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2, 8px)',
                    padding: '6px 0',
                  }}
                >
                  <StatusIcon status={status} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      color: statusColor(status),
                    }}
                  >
                    {statusText(status, latencyMs)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Modules card */}
        <div style={cardStyle}>
          <div style={cardHeader}>Modules</div>
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              fontWeight: 600,
              marginBottom: '4px',
            }}
          >
            {enabledModules.length} modules enabled
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            {modulesSummary}
          </div>
        </div>

        {/* Theme card */}
        <div style={cardStyle}>
          <div style={cardHeader}>Theme</div>
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
            }}
          >
            {themeName} ({modeLabel})
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2, 8px)',
          marginTop: 'var(--space-8, 32px)',
        }}
      >
        <button
          onClick={onLaunch}
          style={{
            padding: '12px 32px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--text-on-accent)',
            fontWeight: 600,
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.2s var(--ease-out)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          Launch Dashboard
        </button>
        <button
          onClick={onTour}
          style={{
            padding: '8px 24px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontWeight: 400,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s var(--ease-out)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--bg-elevated)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          Take a Quick Tour
        </button>
      </div>
    </div>
  )
}
