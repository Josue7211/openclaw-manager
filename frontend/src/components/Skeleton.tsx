
const shimmer = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`
export function Skeleton({ width, height, radius = 6, style }: { width?: string | number; height?: string | number; radius?: number; style?: React.CSSProperties }) {
  return (
    <>
      <style>{shimmer}</style>
      <div style={{
        width: width ?? '100%', height: height ?? 16, borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
        backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }} />
    </>
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
