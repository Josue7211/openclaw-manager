import React, { useState, useEffect } from 'react'
import { setWizardStep, activateDemoMode, completeWizard } from '@/lib/wizard-store'
import { shouldReduceMotion, shouldAnimate } from '@/lib/animation-intensity'
import { Button } from '@/components/ui/Button'

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

export default function WizardWelcome() {
  const visible = useStaggerVisible()
  const reduced = shouldReduceMotion()
  const noAnim = !shouldAnimate()

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
          alt="OpenClaw Manager logo"
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
        Welcome to OpenClaw Manager
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
          onClick={() => activateDemoMode()}
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
          onClick={() => completeWizard()}
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
