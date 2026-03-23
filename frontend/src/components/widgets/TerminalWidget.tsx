import React, { useRef, useCallback } from 'react'
import type { WidgetProps } from '@/lib/widget-registry'
import { useTerminal } from '@/hooks/useTerminal'

export const TerminalWidget = React.memo(function TerminalWidget({
  config,
}: WidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fontSize = (config.fontSize as number) ?? 13

  const { connected, error } = useTerminal(containerRef, { fontSize })

  const handleClick = useCallback(() => {
    // Click-to-focus: focus the terminal on click (not on mount)
    const xtermEl = containerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    xtermEl?.focus()
  }, [])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Connection banner -- collapses when connected */}
      {!connected && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            background: 'var(--bg-elevated)',
            color: error ? 'var(--red)' : 'var(--text-muted)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {error || 'Connecting...'}
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={containerRef}
        className="terminal-container"
        onClick={handleClick}
        style={{
          flex: 1,
          padding: '4px',
          overflow: 'hidden',
          cursor: 'text',
        }}
      />
    </div>
  )
})
