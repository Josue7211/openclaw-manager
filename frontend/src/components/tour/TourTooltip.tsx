/**
 * TourTooltip -- Positioned tooltip with arrow, title, body, Next/Skip buttons.
 *
 * Renders adjacent to a target element using getBoundingClientRect().
 * Automatically adjusts placement if the tooltip would clip the viewport.
 * Focus-trapped dialog with proper ARIA semantics.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { TourStop } from '@/lib/tour-store'
import { shouldReduceMotion } from '@/lib/animation-intensity'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { Button } from '@/components/ui/Button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TourTooltipProps {
  stop: TourStop
  currentIndex: number
  totalStops: number
  onNext: () => void
  onSkip: () => void
  onSkipSection: () => void
}

interface Position {
  top: number
  left: number
  actualPlacement: 'top' | 'bottom' | 'left' | 'right'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOOLTIP_MAX_WIDTH = 320
const TOOLTIP_GAP = 12 // gap between target and tooltip
const VIEWPORT_PADDING = 16 // minimum distance from viewport edge
const ARROW_SIZE = 8

// ---------------------------------------------------------------------------
// Positioning logic
// ---------------------------------------------------------------------------

function calculatePosition(
  targetRect: DOMRect | null,
  tooltipRect: { width: number; height: number },
  placement: TourStop['placement'],
): Position {
  // Fallback: center of screen when no target
  if (!targetRect) {
    return {
      top: window.innerHeight / 2 - tooltipRect.height / 2,
      left: window.innerWidth / 2 - tooltipRect.width / 2,
      actualPlacement: placement,
    }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight

  function tryPlacement(p: 'top' | 'bottom' | 'left' | 'right'): Position | null {
    let top = 0
    let left = 0

    switch (p) {
      case 'bottom':
        top = targetRect.bottom + TOOLTIP_GAP
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
        break
      case 'top':
        top = targetRect.top - tooltipRect.height - TOOLTIP_GAP
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2
        break
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
        left = targetRect.right + TOOLTIP_GAP
        break
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2
        left = targetRect.left - tooltipRect.width - TOOLTIP_GAP
        break
    }

    // Clamp to viewport
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - tooltipRect.width - VIEWPORT_PADDING))
    top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - tooltipRect.height - VIEWPORT_PADDING))

    // Check if it clips the target (overlap means bad placement)
    const tooltipRight = left + tooltipRect.width
    const tooltipBottom = top + tooltipRect.height

    const overlapsX = left < targetRect.right && tooltipRight > targetRect.left
    const overlapsY = top < targetRect.bottom && tooltipBottom > targetRect.top

    if (overlapsX && overlapsY) return null

    return { top, left, actualPlacement: p }
  }

  // Try preferred placement first, then fallbacks
  const fallbackOrder: Record<string, ('top' | 'bottom' | 'left' | 'right')[]> = {
    bottom: ['bottom', 'top', 'right', 'left'],
    top: ['top', 'bottom', 'right', 'left'],
    right: ['right', 'left', 'bottom', 'top'],
    left: ['left', 'right', 'bottom', 'top'],
  }

  const order = fallbackOrder[placement] ?? fallbackOrder.bottom
  for (const p of order) {
    const pos = tryPlacement(p)
    if (pos) return pos
  }

  // Ultimate fallback: use preferred placement with clamping
  const result = tryPlacement(placement)
  return result ?? {
    top: vh / 2 - tooltipRect.height / 2,
    left: vw / 2 - tooltipRect.width / 2,
    actualPlacement: placement,
  }
}

// ---------------------------------------------------------------------------
// Arrow styles
// ---------------------------------------------------------------------------

function getArrowStyle(
  actualPlacement: 'top' | 'bottom' | 'left' | 'right',
  targetRect: DOMRect | null,
  tooltipLeft: number,
  tooltipTop: number,
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
  }

  if (!targetRect) return { ...base, display: 'none' }

  const targetCenterX = targetRect.left + targetRect.width / 2
  const targetCenterY = targetRect.top + targetRect.height / 2

  switch (actualPlacement) {
    case 'bottom':
      return {
        ...base,
        top: -ARROW_SIZE,
        left: Math.max(16, Math.min(targetCenterX - tooltipLeft, TOOLTIP_MAX_WIDTH - 16)) - ARROW_SIZE,
        borderWidth: `0 ${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px`,
        borderColor: 'transparent transparent var(--bg-card-solid) transparent',
      }
    case 'top':
      return {
        ...base,
        bottom: -ARROW_SIZE,
        left: Math.max(16, Math.min(targetCenterX - tooltipLeft, TOOLTIP_MAX_WIDTH - 16)) - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px 0 ${ARROW_SIZE}px`,
        borderColor: 'var(--bg-card-solid) transparent transparent transparent',
      }
    case 'right':
      return {
        ...base,
        left: -ARROW_SIZE,
        top: Math.max(16, Math.min(targetCenterY - tooltipTop, 200)) - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px 0`,
        borderColor: 'transparent var(--bg-card-solid) transparent transparent',
      }
    case 'left':
      return {
        ...base,
        right: -ARROW_SIZE,
        top: Math.max(16, Math.min(targetCenterY - tooltipTop, 200)) - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px 0 ${ARROW_SIZE}px ${ARROW_SIZE}px`,
        borderColor: 'transparent transparent transparent var(--bg-card-solid)',
      }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TourTooltip = React.memo(function TourTooltip({
  stop,
  currentIndex,
  totalStops,
  onNext,
  onSkip,
  onSkipSection: _onSkipSection,
}: TourTooltipProps) {
  const [position, setPosition] = useState<Position | null>(null)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [visible, setVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const focusTrapRef = useFocusTrap(visible)

  const isLast = currentIndex === totalStops - 1
  const reduced = shouldReduceMotion()

  // Recalculate position when stop changes or window resizes
  const recalculate = useCallback(() => {
    const target = document.querySelector(stop.target)
    const rect = target?.getBoundingClientRect() ?? null
    setTargetRect(rect)

    const tooltipEl = tooltipRef.current
    const tooltipSize = tooltipEl
      ? { width: tooltipEl.offsetWidth, height: tooltipEl.offsetHeight }
      : { width: TOOLTIP_MAX_WIDTH, height: 160 } // estimate

    const pos = calculatePosition(rect, tooltipSize, stop.placement)
    setPosition(pos)
  }, [stop.target, stop.placement])

  // Calculate on mount and when stop changes
  useEffect(() => {
    // Small delay to let DOM settle (target elements may be transitioning)
    const timer = setTimeout(() => {
      recalculate()
      setVisible(true)
    }, 50)
    return () => {
      clearTimeout(timer)
      setVisible(false)
    }
  }, [recalculate])

  // Recalculate on resize (debounced)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(recalculate, 100)
    }
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('resize', handler)
      if (timer) clearTimeout(timer)
    }
  }, [recalculate])

  // Recalculate after tooltip renders (we have the actual size now)
  useEffect(() => {
    if (visible && tooltipRef.current) {
      recalculate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const tooltipId = `tour-tooltip-${stop.id}`
  const bodyId = `tour-tooltip-body-${stop.id}`

  return (
    <div
      ref={(node) => {
        // Merge refs: tooltipRef for sizing, focusTrapRef for focus trap
        (tooltipRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        ;(focusTrapRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      role="dialog"
      aria-label={`Tour step ${currentIndex + 1}: ${stop.title}`}
      aria-describedby={bodyId}
      id={tooltipId}
      style={{
        position: 'fixed',
        zIndex: 'var(--z-modal, 10001)' as unknown as number,
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        maxWidth: `${TOOLTIP_MAX_WIDTH}px`,
        background: 'var(--bg-card-solid)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 12px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        padding: 'var(--space-4, 16px)',
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateY(0)'
          : reduced
            ? 'translateY(0)'
            : 'translateY(8px)',
        transition: reduced
          ? 'opacity 0.05s ease'
          : 'opacity 0.2s var(--ease-spring), transform 0.2s var(--ease-spring)',
        pointerEvents: 'auto',
      }}
    >
      {/* Arrow */}
      {position && targetRect && (
        <div
          aria-hidden="true"
          style={getArrowStyle(position.actualPlacement, targetRect, position.left, position.top)}
        />
      )}

      {/* Step counter */}
      <div style={{
        fontSize: '12px',
        color: 'var(--text-muted)',
        marginBottom: '4px',
      }}>
        Step {currentIndex + 1} of {totalStops}
      </div>

      {/* Title */}
      <div style={{
        fontSize: '15px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '4px',
      }}>
        {stop.title}
      </div>

      {/* Body */}
      <div
        id={bodyId}
        style={{
          fontSize: '15px',
          fontWeight: 400,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          marginBottom: 'var(--space-4, 16px)',
        }}
      >
        {stop.body}
      </div>

      {/* Button row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--space-2, 8px)',
      }}>
        <Button
          variant="ghost"
          onClick={onSkip}
          style={{ fontSize: '13px', padding: '6px 12px' }}
        >
          Skip Tour
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          style={{ fontSize: '13px', padding: '6px 16px' }}
        >
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
    </div>
  )
})
