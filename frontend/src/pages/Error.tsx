import { useRouteError } from 'react-router-dom'

export default function ErrorPage() {
  const error = useRouteError() as Error | undefined

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: '16px', padding: '24px', textAlign: 'center',
    }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ color: 'var(--text-secondary, #888)', maxWidth: '400px' }}>
        {error?.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 20px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)',
          background: 'rgba(255,255,255,0.06)', cursor: 'pointer', color: 'inherit',
        }}
      >
        Try again
      </button>
    </div>
  )
}
