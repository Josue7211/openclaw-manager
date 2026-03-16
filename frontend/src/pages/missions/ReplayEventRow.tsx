import React from 'react'
import type { MissionEvent } from './types'
import { EVENT_META, formatElapsed, hexToRgba } from './utils'

export const ReplayEventRow = React.memo(function ReplayEventRow({
  event, index, isActive, elapsed, isExpanded, onToggleExpand, onSelect,
}: {
  event: MissionEvent
  index: number
  isActive: boolean
  elapsed: number
  isExpanded: boolean
  onToggleExpand: (eventKey: string) => void
  onSelect: (index: number) => void
}) {
  const meta = EVENT_META[event.event_type] || EVENT_META.think
  const isThink = event.event_type === 'think'
  const isUser  = event.event_type === 'user'
  const isFile  = event.event_type === 'write' || event.event_type === 'edit' || event.event_type === 'read' || event.event_type === 'glob'
  const isBash  = event.event_type === 'bash' || event.event_type === 'grep'
  const isResult = event.event_type === 'result'
  const isError  = isResult && (event.content.toLowerCase().includes('error') || event.content.toLowerCase().includes('fail'))

  const displayContent = isFile
    ? (event.file_path || event.content)
    : isBash
    ? `$ ${event.content}`
    : event.content

  const activeColor = meta.tickColor
  const eventKey = event.id || String(index)

  return (
    <div
      data-idx={index}
      onClick={isThink || isUser ? () => onToggleExpand(eventKey) : () => onSelect(index)}
      style={{
        display: 'flex',
        alignItems: isThink && isExpanded ? 'flex-start' : 'center',
        gap: '6px',
        padding: '4px 12px',
        borderRadius: '4px',
        cursor: 'pointer',
        background: isActive ? hexToRgba(activeColor, 0.06) : 'transparent',
        borderLeft: `2px solid ${isActive ? activeColor : 'transparent'}`,
        transition: 'background 0.08s, border-color 0.08s',
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = 'var(--bg-white-04)'
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Timestamp */}
      <span style={{
        flexShrink: 0,
        fontSize: '11px',
        fontFamily: 'monospace',
        color: isActive ? meta.labelColor : 'var(--text-muted)',
        minWidth: '44px',
      }}>
        {formatElapsed(elapsed)}
      </span>

      {/* Icon */}
      <span style={{
        flexShrink: 0,
        color: meta.labelColor,
        display: 'flex',
        alignItems: 'center',
        width: '14px',
        opacity: 1,
      }}>
        {meta.icon}
      </span>

      {/* Type label */}
      <span style={{
        flexShrink: 0,
        fontSize: '10px',
        fontWeight: 700,
        fontFamily: 'monospace',
        textTransform: 'uppercase',
        color: meta.labelColor,
        minWidth: '44px',
      }}>
        {meta.label}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontFamily: isFile || isBash ? 'monospace' : 'inherit',
          color: isThink ? 'var(--text-muted)' : isError ? 'var(--red-bright)' : 'var(--text-primary)',
          fontStyle: isThink ? 'italic' : 'normal',
          overflow: isThink && isExpanded ? 'visible' : 'hidden',
          textOverflow: isThink && isExpanded ? undefined : 'ellipsis',
          whiteSpace: isThink && isExpanded ? 'normal' : 'nowrap',
          lineHeight: 1.4,
        }}>
          {displayContent}
        </div>
        {/* Expanded think/user content */}
        {(isThink || isUser) && isExpanded && (
          <div style={{
            marginTop: '4px',
            fontSize: '11px',
            color: isThink ? 'var(--text-muted)' : 'var(--text-primary)',
            fontStyle: isThink ? 'italic' : 'normal',
            lineHeight: 1.5,
            background: 'var(--bg-white-02)',
            borderRadius: '4px',
            padding: '6px 8px',
            whiteSpace: 'pre-wrap',
          }}>
            {event.content}
          </div>
        )}
      </div>
    </div>
  )
})
