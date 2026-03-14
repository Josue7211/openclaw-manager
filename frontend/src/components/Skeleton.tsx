
export function Skeleton({ width, height, radius = 6, style }: { width?: string | number; height?: string | number; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: width ?? '100%', height: height ?? 16, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-panel) 50%, var(--bg-elevated) 75%)',
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
    <div style={{ background: 'var(--bg-card, rgba(255,255,255,0.03))', borderRadius: 12, padding: 20, border: '1px solid var(--border)', ...style }}>
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

/* ── Page-specific skeleton screens ──────────────────────────────────── */

/** Personal page: greeting card + 3 summary columns + todo list */
export function PersonalSkeleton() {
  return (
    <div style={{ animation: 'pageEnter 0.25s var(--ease-spring) both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Skeleton width={220} height={22} style={{ marginBottom: 6 }} />
          <Skeleton width={140} height={12} />
        </div>
        <Skeleton width={100} height={32} radius={10} />
      </div>

      {/* Greeting card */}
      <div style={{
        background: 'var(--bg-panel)', borderRadius: 16, padding: 24, marginBottom: 24,
        border: '1px solid rgba(155,132,236,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Skeleton width={18} height={18} radius={4} />
              <Skeleton width={160} height={18} />
            </div>
            <Skeleton width={200} height={12} />
          </div>
          <Skeleton width={200} height={14} />
        </div>
        {/* 3 summary columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Skeleton width={12} height={12} radius={3} />
                <Skeleton width={80} height={10} />
              </div>
              <SkeletonRows count={2} />
            </div>
          ))}
        </div>
      </div>

      {/* Daily review placeholder */}
      <Skeleton width="100%" height={52} radius={16} style={{ marginBottom: 24 }} />

      {/* Bottom grid: todo + infra cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {[0, 1, 2].map(i => (
          <SkeletonCard key={i} lines={i === 0 ? 4 : 3} />
        ))}
      </div>
    </div>
  )
}

/** Dashboard page: header + 2-column grid of cards */
export function DashboardSkeleton() {
  return (
    <div style={{ animation: 'pageEnter 0.25s var(--ease-spring) both' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <Skeleton width={180} height={22} style={{ marginBottom: 6 }} />
          <Skeleton width={120} height={12} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Skeleton width={100} height={12} />
          <Skeleton width={80} height={32} radius={10} />
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: '16px 20px', marginBottom: 20,
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <Skeleton width={10} height={10} radius={99} />
        <Skeleton width={120} height={14} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <Skeleton width={80} height={12} />
          <Skeleton width={80} height={12} />
        </div>
      </div>

      {/* 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonCard key={i} lines={i < 2 ? 4 : 3} style={{
            animationDelay: `${i * 60}ms`,
            animation: 'pageEnter 0.3s var(--ease-spring) both',
          }} />
        ))}
      </div>
    </div>
  )
}

/** Messages page: conversation list skeleton + thread skeleton */
export function MessagesConversationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          borderRadius: 10,
        }}>
          {/* Avatar */}
          <Skeleton width={40} height={40} radius={99} />
          {/* Name + preview */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width={`${50 + (i % 3) * 15}%`} height={13} style={{ marginBottom: 6 }} />
            <Skeleton width={`${60 + (i % 2) * 20}%`} height={11} />
          </div>
          {/* Timestamp */}
          <Skeleton width={36} height={10} />
        </div>
      ))}
    </div>
  )
}

export function MessagesThreadSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px' }}>
      {Array.from({ length: 6 }).map((_, i) => {
        const fromMe = i % 3 === 0
        const widths = [180, 240, 140, 200, 260, 160]
        return (
          <div key={i} style={{ display: 'flex', justifyContent: fromMe ? 'flex-end' : 'flex-start' }}>
            <Skeleton
              width={widths[i]}
              height={36}
              radius={18}
              style={{
                background: fromMe
                  ? 'linear-gradient(90deg, rgba(129,140,248,0.12) 25%, rgba(129,140,248,0.2) 50%, rgba(129,140,248,0.12) 75%)'
                  : undefined,
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
