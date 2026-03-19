import React from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { Button } from './Button'

interface ErrorStateProps {
  message?: string
  resource?: string
  onRetry?: () => void
}

export const ErrorState = React.memo(function ErrorState({
  message,
  resource,
  onRetry,
}: ErrorStateProps) {
  const body =
    message ??
    (resource
      ? `We couldn't load your ${resource}. Check your connection and try again.`
      : "We couldn't load this page. Check your connection and try again.")

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 36px',
          maxWidth: '460px',
          width: '100%',
        }}
      >
        <WarningCircle
          size={48}
          weight="regular"
          style={{
            color: 'var(--red-500)',
            marginBottom: 'var(--space-5)',
          }}
        />

        <h2
          style={{
            margin: '0 0 8px',
            fontSize: 'var(--text-xl)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Something went wrong
        </h2>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          {body}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try Again
            </Button>
          )}
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    </div>
  )
})
