import React from 'react'

interface DotIndicatorsProps {
  pageCount: number
  activeIndex: number
  visible: boolean
}

export const DotIndicators = React.memo(function DotIndicators({
  pageCount,
  activeIndex,
  visible,
}: DotIndicatorsProps) {
  if (!visible) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
      }}
    >
      {Array.from({ length: pageCount }, (_, i) => (
        <span
          key={i}
          data-dot
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '999px',
            background: i === activeIndex ? 'var(--accent)' : 'var(--text-muted)',
            opacity: i === activeIndex ? 1 : 0.3,
            transition: 'background 0.2s ease, opacity 0.2s ease',
          }}
        />
      ))}
    </div>
  )
})
