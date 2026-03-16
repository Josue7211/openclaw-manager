export function LoadingSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            height: '38px',
            borderBottom: i < rows - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 0',
          }}
        >
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--bg-elevated)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{
            height: '12px',
            width: `${40 + Math.random() * 30}%`,
            background: 'var(--bg-elevated)',
            borderRadius: '4px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
      ))}
    </>
  )
}
