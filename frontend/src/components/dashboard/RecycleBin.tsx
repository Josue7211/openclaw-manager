import React, { useState, useCallback } from 'react'
import {
  TrashSimple,
  ArrowCounterClockwise,
  Cube,
  Robot,
  Heartbeat,
  UsersThree,
  Rocket,
  Brain,
  Lightbulb,
  WifiHigh,
  Terminal,
} from '@phosphor-icons/react'
import { getWidget } from '@/lib/widget-registry'
import { restoreWidget, clearRecycleBin } from '@/lib/dashboard-store'
import type { RecycleBinItem } from '@/lib/dashboard-store'

// ---------------------------------------------------------------------------
// Icon lookup
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  Robot,
  Heartbeat,
  UsersThree,
  Rocket,
  Brain,
  Lightbulb,
  WifiHigh,
  Terminal,
  Cube,
}

// ---------------------------------------------------------------------------
// RecycleBin
// ---------------------------------------------------------------------------

interface RecycleBinProps {
  items: RecycleBinItem[]
  visible: boolean
}

export const RecycleBin = React.memo(function RecycleBin({
  items,
  visible,
}: RecycleBinProps) {
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleRestore = useCallback((index: number) => {
    restoreWidget(index)
  }, [])

  const handleClearAll = useCallback(() => {
    clearRecycleBin()
    setShowConfirm(false)
    setExpanded(false)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 'var(--z-modal)',
        background: 'var(--bg-card-solid)',
        borderTop: '1px solid var(--border)',
        borderRadius: '16px 16px 0 0',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
        transition: 'height 250ms var(--ease-spring)',
        height: expanded ? '120px' : '44px',
        overflow: 'hidden',
      }}
    >
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? 'Collapse recycle bin' : 'Expand recycle bin'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '0 16px',
          height: '44px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {/* Handle bar */}
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '40px',
            height: '4px',
            borderRadius: '999px',
            background: 'var(--text-muted)',
            opacity: 0.3,
          }}
        />

        <TrashSimple
          size={16}
          style={{ color: 'var(--text-muted)' }}
        />
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          Recycle Bin
        </span>
        {items.length > 0 && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--hover-bg)',
              padding: '1px 8px',
              borderRadius: '999px',
            }}
          >
            {items.length}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 16px',
            height: '76px',
            overflow: 'auto',
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              No removed widgets
            </div>
          ) : showConfirm ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                Widgets can't be restored after clearing.
              </span>
              <button
                onClick={handleClearAll}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: 'var(--red-500)',
                  color: 'var(--text-on-color)',
                }}
              >
                Clear All Widgets
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                }}
              >
                Keep Widgets
              </button>
            </div>
          ) : (
            <>
              {/* Widget thumbnails */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflow: 'auto',
                  flex: 1,
                }}
              >
                {items.map((item, index) => {
                  const def = getWidget(item.pluginId)
                  const Icon = def?.icon
                    ? ICON_MAP[def.icon] || Cube
                    : Cube
                  const name = def?.name || item.pluginId

                  return (
                    <button
                      key={item.widgetId}
                      onDoubleClick={() => handleRestore(index)}
                      title={`Double-click to restore ${name}`}
                      style={{
                        width: '80px',
                        height: '60px',
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'border-color 150ms ease',
                      }}
                    >
                      <Icon size={24} style={{ color: 'var(--text-muted)' }} />
                      <span
                        style={{
                          fontSize: '10px',
                          color: 'var(--text-secondary)',
                          maxWidth: '72px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {name}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Clear All button */}
              <button
                onClick={() => setShowConfirm(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Clear All
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
})
