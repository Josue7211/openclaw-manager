interface TagChipProps {
  tag: string
  active?: boolean
  onClick: () => void
}

export function TagChip({ tag, active, onClick }: TagChipProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--border-accent)' : 'var(--purple-a08)',
        color: active ? 'var(--accent-bright)' : 'var(--accent)',
        border: `1px solid ${active ? 'var(--purple-a40)' : 'var(--purple-a15)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </button>
  )
}
