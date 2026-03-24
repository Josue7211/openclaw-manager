import React from 'react'

/* ─── Constants ────────────────────────────────────────────────────────── */

const REACTION_EMOJI: Record<number, string> = {
  2000: '❤️', 2001: '👍', 2002: '👎',
  2003: '😂', 2004: '‼️', 2005: '❓',
}

/* ─── Types ────────────────────────────────────────────────────────────── */

interface Reaction {
  type: number        // 2000–2005
  fromMe: boolean
  handle?: string
}

/* ─── ReactionPills ──────────────────────────────────────────────────────── */

const ReactionPills = React.memo(function ReactionPills({ reactions, fromMe }: { reactions: Reaction[]; fromMe: boolean }) {
  if (!reactions || reactions.length === 0) return null

  const grouped = new Map<number, number>()
  for (const r of reactions) {
    grouped.set(r.type, (grouped.get(r.type) || 0) + 1)
  }

  return (
    <div style={{
      display: 'flex', gap: '4px',
      justifyContent: fromMe ? 'flex-end' : 'flex-start',
      marginTop: '-6px',
      paddingBottom: '2px',
      paddingLeft: fromMe ? '0' : '12px',
      paddingRight: fromMe ? '12px' : '0',
    }}>
      {Array.from(grouped.entries()).map(([type, count]) => (
        <div key={type} style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '2px 6px',
          fontSize: '12px', lineHeight: 1,
          animation: 'emojiPop 0.25s var(--ease-spring)',
        }}>
          <span>{REACTION_EMOJI[type] || '?'}</span>
          {count > 1 && (
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              {count}
            </span>
          )}
        </div>
      ))}
    </div>
  )
})

export default ReactionPills
