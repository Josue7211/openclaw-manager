import React, { useState, useRef, useEffect } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { shouldAnimate } from '@/lib/animation-intensity'

interface WizardGuidePanelProps {
  title?: string
  children: React.ReactNode
}

export const WizardGuidePanel = React.memo(function WizardGuidePanel({
  title = 'Setup Guide',
  children,
}: WizardGuidePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const animate = shouldAnimate()

  // Measure content height when expanded for smooth animation
  useEffect(() => {
    if (expanded && contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [expanded, children])

  const toggleId = `guide-toggle-${title.replace(/\s+/g, '-').toLowerCase()}`
  const regionId = `guide-region-${title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md, 10px)',
        overflow: 'hidden',
      }}
    >
      {/* Toggle button */}
      <button
        id={toggleId}
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 'var(--space-4, 16px)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm, 13px)',
          fontWeight: 600,
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <CaretDown
          size={14}
          weight="bold"
          style={{
            transition: animate ? 'transform 0.25s var(--ease-spring)' : undefined,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />
        {title}
      </button>

      {/* Expandable content region */}
      <div
        id={regionId}
        role="region"
        aria-label={`Setup guide for ${title}`}
        aria-labelledby={toggleId}
        style={{
          overflow: 'hidden',
          transition: animate
            ? 'max-height 0.25s var(--ease-spring), opacity 0.25s var(--ease-spring)'
            : undefined,
          maxHeight: expanded ? (contentHeight || 500) : 0,
          opacity: expanded ? 1 : 0,
        }}
      >
        <div
          ref={contentRef}
          style={{
            padding: '0 var(--space-4, 16px) var(--space-4, 16px)',
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
})
