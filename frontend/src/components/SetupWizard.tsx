import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import {
  useWizardState,
  setWizardStep,
  markStepCompleted,
  completeWizard,
  activateDemoMode,
  STEP_NAMES,
  REQUIRED_STEPS,
} from '@/lib/wizard-store'
import { shouldReduceMotion } from '@/lib/animation-intensity'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { WizardStepDots } from '@/components/wizard/WizardStepDots'
import { Button } from '@/components/ui/Button'
import { Play, ArrowLeft, ArrowRight } from '@phosphor-icons/react'

// ---------------------------------------------------------------------------
// Lazy step components
// ---------------------------------------------------------------------------

const WizardWelcome = React.lazy(() => import('@/components/wizard/WizardWelcome'))

// Placeholder for steps not yet built
function StepPlaceholder({ step }: { step: number }) {
  return (
    <div style={{ padding: 24 }}>
      <p style={{ color: 'var(--text-muted)' }}>
        Step {step + 1}: {STEP_NAMES[step]} -- coming soon
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transition state machine
// ---------------------------------------------------------------------------

type TransitionPhase = 'idle' | 'exiting' | 'measuring' | 'entering'

interface SetupWizardProps {
  onComplete: () => void
}

// Max-width for specific steps
function getMaxWidth(step: number): number {
  if (step === 6 || step === 7) return 800
  return 640
}

// Total steps count (STEP_NAMES has 10 entries but the last is 'Done')
const TOTAL_STEPS = STEP_NAMES.length - 1 // 0-8 are real steps, 9 is "Done"

export default function SetupWizard({ onComplete }: SetupWizardProps) {
  const wizard = useWizardState()
  const containerRef = useFocusTrap(true)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevStepRef = useRef(wizard.currentStep)

  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle')
  const [displayedStep, setDisplayedStep] = useState(wizard.currentStep)
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward')
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined)

  // Announce step change to screen readers
  const announceRef = useRef<HTMLDivElement>(null)

  // ---------------------------------------------------------------------------
  // Step transition
  // ---------------------------------------------------------------------------

  const animateTransition = useCallback(
    (newStep: number) => {
      if (shouldReduceMotion()) {
        // Reduced motion: instant swap with optional short crossfade
        setDisplayedStep(newStep)
        setContainerHeight(undefined)
        prevStepRef.current = newStep
        if (announceRef.current) {
          announceRef.current.textContent = `Step ${newStep + 1} of ${TOTAL_STEPS + 1}: ${STEP_NAMES[newStep]}`
        }
        return
      }

      const dir = newStep > prevStepRef.current ? 'forward' : 'backward'
      setDirection(dir)

      // Phase 1: Exit current content
      setTransitionPhase('exiting')

      setTimeout(() => {
        // Phase 2: Swap content and measure
        setTransitionPhase('measuring')
        setDisplayedStep(newStep)

        // Use rAF to let React render, then measure height
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (contentRef.current) {
              const height = contentRef.current.offsetHeight
              setContainerHeight(height)
            }

            // Phase 3: Enter new content
            setTimeout(() => {
              setTransitionPhase('entering')
              if (announceRef.current) {
                announceRef.current.textContent = `Step ${newStep + 1} of ${TOTAL_STEPS + 1}: ${STEP_NAMES[newStep]}`
              }

              setTimeout(() => {
                setTransitionPhase('idle')
                setContainerHeight(undefined)
                prevStepRef.current = newStep
              }, 250)
            }, 100)
          })
        })
      }, 200)
    },
    [],
  )

  // Watch for step changes from wizard store
  useEffect(() => {
    if (wizard.currentStep !== prevStepRef.current && transitionPhase === 'idle') {
      animateTransition(wizard.currentStep)
    }
  }, [wizard.currentStep, animateTransition, transitionPhase])

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  const handleNext = useCallback(() => {
    if (wizard.currentStep >= TOTAL_STEPS) {
      // At summary step -- launch dashboard
      completeWizard()
      onComplete()
      return
    }
    markStepCompleted(wizard.currentStep)
    setWizardStep(wizard.currentStep + 1)
  }, [wizard.currentStep, onComplete])

  const handleBack = useCallback(() => {
    if (wizard.currentStep > 0) {
      setWizardStep(wizard.currentStep - 1)
    }
  }, [wizard.currentStep])

  const handleSkip = useCallback(() => {
    markStepCompleted(wizard.currentStep)
    setWizardStep(wizard.currentStep + 1)
  }, [wizard.currentStep])

  const handleTryDemo = useCallback(() => {
    activateDemoMode()
    completeWizard()
    onComplete()
  }, [onComplete])

  // ---------------------------------------------------------------------------
  // Determine if Next should be disabled
  // ---------------------------------------------------------------------------

  const isNextDisabled = (() => {
    const step = wizard.currentStep
    if ((REQUIRED_STEPS as readonly number[]).includes(step)) {
      // Required steps need a passing test result
      const serviceMap: Record<number, string> = {
        1: 'tailscale',
        2: 'supabase',
        3: 'openclaw',
      }
      const key = serviceMap[step]
      if (key) {
        const result = wizard.testResults[key]
        return !result || result.status !== 'success'
      }
    }
    return false
  })()

  // ---------------------------------------------------------------------------
  // Next button label
  // ---------------------------------------------------------------------------

  const nextLabel = (() => {
    if (wizard.currentStep === 0) return 'Get Started'
    if (wizard.currentStep >= TOTAL_STEPS) return 'Launch Dashboard'
    return 'Next'
  })()

  // ---------------------------------------------------------------------------
  // Visibility flags for buttons
  // ---------------------------------------------------------------------------

  const isWelcome = wizard.currentStep === 0
  const isSummary = wizard.currentStep >= TOTAL_STEPS
  const isOptional = wizard.currentStep === 4 || wizard.currentStep === 5
  const showTryDemo = !isWelcome && !isSummary
  const showBack = !isWelcome
  const showSkip = isOptional

  // ---------------------------------------------------------------------------
  // Render step content
  // ---------------------------------------------------------------------------

  function renderStepContent(step: number) {
    switch (step) {
      case 0:
        return (
          <Suspense fallback={null}>
            <WizardWelcome />
          </Suspense>
        )
      default:
        return <StepPlaceholder step={step} />
    }
  }

  // ---------------------------------------------------------------------------
  // Transition styles
  // ---------------------------------------------------------------------------

  const getContentStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      transition: 'opacity 0.2s var(--ease-out), transform 0.25s var(--ease-spring)',
    }

    if (transitionPhase === 'exiting') {
      const scale = direction === 'forward' ? 'scale(0.96)' : 'scale(1.04)'
      const ty = direction === 'forward' ? 'translateY(8px)' : 'translateY(-8px)'
      return { ...base, opacity: 0, transform: `${scale} ${ty}` }
    }

    if (transitionPhase === 'measuring') {
      return { ...base, opacity: 0, transform: 'scale(1)', position: 'absolute', visibility: 'hidden' }
    }

    if (transitionPhase === 'entering') {
      return { ...base, opacity: 1, transform: 'scale(1) translateY(0)' }
    }

    // idle
    return { opacity: 1, transform: 'scale(1) translateY(0)' }
  }

  return (
    <div
      ref={containerRef}
      className="wizard-container"
      role="dialog"
      aria-modal="true"
      aria-label="Setup wizard"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-wizard, 10000)' as unknown as number,
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow handled by .wizard-container::before in globals.css */}

      {/* Step dots */}
      <WizardStepDots
        currentStep={wizard.currentStep}
        stepStatus={wizard.stepStatus}
        completedSteps={wizard.completedSteps}
        testResults={wizard.testResults}
      />

      {/* Screen reader announcements */}
      <div
        ref={announceRef}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />

      {/* Step viewport */}
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: getMaxWidth(displayedStep),
          padding: '0 var(--space-6, 24px)',
          position: 'relative',
          zIndex: 1,
          overflow: 'auto',
        }}
      >
        {/* Transition container with height morphing */}
        <div
          style={{
            width: '100%',
            position: 'relative',
            overflow: transitionPhase !== 'idle' ? 'hidden' : undefined,
            transition:
              containerHeight !== undefined
                ? 'height 0.25s var(--ease-spring)'
                : undefined,
            height: containerHeight !== undefined ? containerHeight : undefined,
          }}
        >
          <div ref={contentRef} style={getContentStyle()}>
            {renderStepContent(displayedStep)}
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      {!isWelcome && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: getMaxWidth(wizard.currentStep),
            padding: 'var(--space-4, 16px) var(--space-6, 24px) var(--space-8, 32px)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Left side: Try Demo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showTryDemo && (
              <Button
                variant="ghost"
                onClick={handleTryDemo}
                aria-label="Enter demo mode with sample data"
                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Play size={16} /> Try Demo
              </Button>
            )}
          </div>

          {/* Right side: Back / Skip / Next */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showBack && (
              <Button
                variant="secondary"
                onClick={handleBack}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <ArrowLeft size={16} /> Back
              </Button>
            )}
            {showSkip && (
              <Button
                variant="ghost"
                onClick={handleSkip}
                aria-label={`Skip ${STEP_NAMES[wizard.currentStep]}`}
                style={{ color: 'var(--text-muted)' }}
              >
                Skip
              </Button>
            )}
            <Button
              variant="primary"
              onClick={handleNext}
              disabled={isNextDisabled}
              aria-disabled={isNextDisabled || undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {nextLabel} {!isSummary && <ArrowRight size={16} />}
            </Button>
            {isSummary && (
              <Button
                variant="secondary"
                onClick={() => {
                  /* Tour will be implemented in a later plan */
                }}
              >
                Take a Quick Tour
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
