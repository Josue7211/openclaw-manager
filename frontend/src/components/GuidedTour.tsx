/**
 * GuidedTour -- Full-screen spotlight overlay with clip-path cutout and TourTooltip.
 *
 * Rendered via createPortal into document.body.
 * Uses clip-path polygon with evenodd fill rule to create a rectangular
 * cutout around the current tour stop's target element, allowing clicks through.
 *
 * The TourTooltip is a sibling of the backdrop (not nested) so it is not clipped.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  useTourState,
  TOUR_STOPS,
  getCurrentStop,
  nextStop,
  skipTour,
  skipSection,
} from '@/lib/tour-store'
import { TourTooltip } from '@/components/tour/TourTooltip'
import { shouldReduceMotion } from '@/lib/animation-intensity'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPOTLIGHT_PADDING = 8 // px around target element

// ---------------------------------------------------------------------------
// Clip-path calculation
// ---------------------------------------------------------------------------

function buildClipPath(rect: DOMRect | null): string {
  if (!rect) {
    // No target found -- no cutout, full backdrop
    return 'none'
  }

  const x1 = rect.left - SPOTLIGHT_PADDING
  const y1 = rect.top - SPOTLIGHT_PADDING
  const x2 = rect.right + SPOTLIGHT_PADDING
  const y2 = rect.bottom + SPOTLIGHT_PADDING

  // polygon with evenodd: outer rect = full viewport, inner rect = cutout hole
  return `polygon(
    evenodd,
    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
    ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px
  )`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuidedTour() {
  const tourState = useTourState()
  const currentStop = getCurrentStop()
  const [clipPath, setClipPath] = useState<string>('none')
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [visible, setVisible] = useState(false)
  const observerRef = useRef<ResizeObserver | null>(null)
  const reduced = shouldReduceMotion()

  // Recalculate spotlight position
  const recalculate = useCallback(() => {
    if (!currentStop) {
      setClipPath('none')
      setTargetRect(null)
      return
    }

    const target = document.querySelector(currentStop.target)
    if (!target) {
      setClipPath('none')
      setTargetRect(null)
      return
    }

    const rect = target.getBoundingClientRect()
    setTargetRect(rect)
    setClipPath(buildClipPath(rect))
  }, [currentStop])

  // Recalculate on stop change
  useEffect(() => {
    setVisible(false)
    const timer = setTimeout(() => {
      recalculate()
      setVisible(true)
    }, 50)
    return () => clearTimeout(timer)
  }, [recalculate, tourState.currentStopIndex])

  // Watch target element for size/position changes
  useEffect(() => {
    if (!currentStop) return

    const target = document.querySelector(currentStop.target)
    if (!target) return

    // Observe target for layout changes
    const observer = new ResizeObserver(() => recalculate())
    observer.observe(target)
    observerRef.current = observer

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [currentStop, recalculate])

  // Recalculate on window resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(recalculate, 100)
    }
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
      if (timer) clearTimeout(timer)
    }
  }, [recalculate])

  // Escape key to skip tour
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        skipTour()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  if (!tourState.active || !currentStop) return null

  const hasTarget = !!targetRect

  return createPortal(
    <>
      {/* Backdrop with spotlight cutout */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-modal, 10000)' as unknown as number,
          background: 'rgba(0, 0, 0, 0.3)',
          clipPath: hasTarget ? clipPath : 'none',
          WebkitClipPath: hasTarget ? clipPath : 'none',
          opacity: visible ? 1 : 0,
          transition: reduced
            ? 'opacity 0.05s ease'
            : 'opacity 0.3s ease, clip-path 0.3s ease',
          // pointer-events auto so clicking the dark area doesn't do anything unintended
          // The cutout area naturally allows clicks through since it's not covered
          pointerEvents: 'auto',
        }}
        onClick={(e) => {
          // Clicking the backdrop (dark area) should not dismiss -- user must use buttons
          e.stopPropagation()
        }}
      />

      {/* Tooltip */}
      <TourTooltip
        stop={currentStop}
        currentIndex={tourState.currentStopIndex}
        totalStops={TOUR_STOPS.length}
        onNext={nextStop}
        onSkip={skipTour}
        onSkipSection={skipSection}
      />

      {/* Centered fallback message when target is not in DOM */}
      {!hasTarget && visible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 'var(--z-modal, 10001)' as unknown as number,
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 'var(--space-4, 16px)',
            maxWidth: '320px',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            This feature is not visible on the current page.
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Click &quot;Next&quot; in the tooltip to continue the tour.
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}
