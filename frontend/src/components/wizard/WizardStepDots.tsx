import React from 'react'
import { STEP_NAMES } from '@/lib/wizard-store'
import type { TestResult } from '@/lib/wizard-store'

interface WizardStepDotsProps {
  currentStep: number
  stepStatus: Record<number, string>
  completedSteps: number[]
  testResults: Record<string, TestResult>
}

/** Service steps whose test results map to step indices */
const SERVICE_STEP_MAP: Record<number, string> = {
  1: 'tailscale',
  2: 'supabase',
  3: 'openclaw',
  4: 'bluebubbles', // also macbridge
  5: 'couchdb',
}

function getDotState(
  index: number,
  currentStep: number,
  completedSteps: number[],
  stepStatus: Record<number, string>,
  testResults: Record<string, TestResult>,
): 'completed' | 'completed-success' | 'completed-dimmed' | 'current' | 'upcoming' | 'error' {
  if (stepStatus[index] === 'error') return 'error'

  if (completedSteps.includes(index)) {
    const serviceKey = SERVICE_STEP_MAP[index]
    if (serviceKey) {
      const result = testResults[serviceKey]
      if (result?.status === 'success') return 'completed-success'
      if (result?.status === 'error' || stepStatus[index] === 'skipped') return 'completed-dimmed'
    }
    return 'completed'
  }

  if (index === currentStep) return 'current'
  return 'upcoming'
}

function getStatusLabel(dotState: string): string {
  switch (dotState) {
    case 'completed':
    case 'completed-success':
      return 'completed'
    case 'completed-dimmed':
      return 'skipped'
    case 'current':
      return 'current'
    case 'error':
      return 'error'
    default:
      return 'upcoming'
  }
}

const dotBaseStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 'var(--radius-full)',
  transition: 'all 0.3s var(--ease-spring)',
  flexShrink: 0,
}

const dotStyles: Record<string, React.CSSProperties> = {
  completed: {
    ...dotBaseStyle,
    background: 'var(--accent)',
    border: 'none',
  },
  'completed-success': {
    ...dotBaseStyle,
    background: 'var(--green)',
    border: 'none',
  },
  'completed-dimmed': {
    ...dotBaseStyle,
    background: 'var(--text-muted)',
    border: 'none',
    opacity: 0.5,
  },
  current: {
    ...dotBaseStyle,
    background: 'transparent',
    border: '2px solid var(--accent)',
    animation: 'dot-pulse 2s ease-in-out infinite',
  },
  upcoming: {
    ...dotBaseStyle,
    background: 'transparent',
    border: '1px solid var(--border-hover)',
    opacity: 0.3,
  },
  error: {
    ...dotBaseStyle,
    background: 'var(--red-500)',
    border: 'none',
  },
}

export const WizardStepDots = React.memo(function WizardStepDots({
  currentStep,
  stepStatus,
  completedSteps,
  testResults,
}: WizardStepDotsProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={0}
      aria-valuemax={9}
      aria-label="Setup progress"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingTop: 32,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {STEP_NAMES.map((name, i) => {
        const state = getDotState(i, currentStep, completedSteps, stepStatus, testResults)
        const label = getStatusLabel(state)
        return (
          <div
            key={i}
            aria-label={`Step ${i + 1}: ${name} (${label})`}
            style={dotStyles[state]}
          />
        )
      })}
    </div>
  )
})
