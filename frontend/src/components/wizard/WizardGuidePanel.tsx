/**
 * WizardGuidePanel -- Expandable setup instructions panel for wizard service steps.
 *
 * STUB: Created by plan 03-04 because sibling plan 03-03 may not have completed yet.
 * Plan 03-03 will deliver the final version of this component. If that plan has already
 * run and this file was overwritten, the final version takes precedence.
 */

import React, { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'

interface WizardGuidePanelProps {
  title?: string
  children: React.ReactNode
}

export const WizardGuidePanel = React.memo(function WizardGuidePanel({
  title = 'Setup Guide',
  children,
}: WizardGuidePanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          width: '100%',
          padding: 'var(--space-4)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          fontFamily: 'inherit',
        }}
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
      {expanded && (
        <div
          role="region"
          aria-label={title}
          style={{ padding: '0 var(--space-4) var(--space-4)' }}
        >
          {children}
        </div>
      )}
    </div>
  )
})
