import React from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState = React.memo(function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12) var(--space-6)',
        textAlign: 'center',
      }}
    >
      <Icon
        size={48}
        weight="regular"
        style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-4)' }}
      />
      <h3
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 600,
          lineHeight: 1.2,
          margin: '0 0 var(--space-2)',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            margin: 0,
            maxWidth: '360px',
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  )
})
