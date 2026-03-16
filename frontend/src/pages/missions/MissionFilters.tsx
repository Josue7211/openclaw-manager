import type { Tab } from './types'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'active',  label: 'Active' },
  { key: 'review',  label: 'Review' },
  { key: 'pending', label: 'Pending' },
  { key: 'done',    label: 'Done' },
]

export function MissionFilters({
  tab,
  counts,
  onTabChange,
}: {
  tab: Tab
  counts: Record<Tab, number>
  onTabChange: (tab: Tab) => void
}) {
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexShrink: 0 }}>
      {TABS.map(({ key, label }) => {
        const active = tab === key
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              padding: '5px 14px', borderRadius: '20px',
              border: `1px solid ${active ? 'var(--purple-a40)' : 'var(--border)'}`,
              background: active ? 'var(--purple-a12)' : 'transparent',
              color: active ? 'var(--accent-bright)' : 'var(--text-secondary)',
              fontSize: '12px', fontWeight: active ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.25s var(--ease-spring)',
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            {label}
            <span style={{
              fontSize: '10px', fontFamily: 'monospace',
              background: active ? 'var(--purple-a20)' : 'var(--hover-bg)',
              padding: '1px 5px', borderRadius: '10px',
              color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
            }}>
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
