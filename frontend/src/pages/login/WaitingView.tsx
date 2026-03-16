interface WaitingViewProps {
  onCancel: () => void
}

export function WaitingView({ onCancel }: WaitingViewProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      padding: '12px 0',
      animation: 'fadeInUp 0.3s var(--ease-spring) both',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{
        fontSize: '12px',
        color: 'var(--text-secondary)',
        margin: 0,
        textAlign: 'center',
      }}>
        Waiting for you to authorize in the browser...
      </p>
      <button
        onClick={onCancel}
        className="hover-text-secondary"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '12px',
          cursor: 'pointer',
          padding: '4px',
          transition: 'all 0.15s',
        }}
      >
        Cancel
      </button>
    </div>
  )
}
