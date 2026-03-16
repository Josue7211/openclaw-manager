interface HistoryErrorBannerProps {
  error: string
  onRetry: () => void
}

export function HistoryErrorBanner({ error, onRetry }: HistoryErrorBannerProps) {
  return (
    <div style={{
      marginBottom: '12px', padding: '12px 16px', flexShrink: 0,
      background: 'var(--red-a08)',
      border: '1px solid var(--red-500-a25)',
      borderRadius: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: '13px', color: 'var(--red)' }}>
        Could not load chat history: {error}
      </span>
      <button
        onClick={onRetry}
        style={{
          background: 'var(--red-a15)', border: '1px solid var(--red-a30)',
          borderRadius: '8px', padding: '4px 12px', color: 'var(--red)',
          fontSize: '12px', cursor: 'pointer', flexShrink: 0,
        }}
      >
        Retry
      </button>
    </div>
  )
}
