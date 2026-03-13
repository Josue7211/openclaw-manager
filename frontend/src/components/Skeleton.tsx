
export function Skeleton({ width, height, radius = 6, style }: { width?: string | number; height?: string | number; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: width ?? '100%', height: height ?? 16, borderRadius: radius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite',
      ...style,
    }} />
  )
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: '8px 10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <Skeleton width={`${60 + (i % 3) * 15}%`} height={16} style={{ marginBottom: '4px' }} />
          <Skeleton width={`${40 + (i % 2) * 20}%`} height={11} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ lines = 3, style }: { lines?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)', ...style }}>
      <Skeleton width="40%" height={14} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 3, lines = 2, layout = 'column', gap = '8px' }: { count?: number; lines?: number; layout?: 'column' | 'grid'; gap?: string }) {
  return (
    <div style={layout === 'grid'
      ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap }
      : { display: 'flex', flexDirection: 'column', gap }
    }>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}
