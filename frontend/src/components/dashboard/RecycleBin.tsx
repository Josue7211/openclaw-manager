import React, { useState, useCallback } from 'react'
import {
  TrashSimple,
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
  placement?: 'floating' | 'toolbar'
  /** Override: custom restore handler instead of dashboard-store restoreWidget */
  onRestore?: (index: number) => void
  /** Override: custom clear handler instead of dashboard-store clearRecycleBin */
  onClearAll?: () => void
}

export const RecycleBin = React.memo(function RecycleBin({
  items,
  visible,
  placement = 'floating',
  onRestore,
  onClearAll,
}: RecycleBinProps) {
  const [expanded, setExpanded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const restorer = onRestore ?? restoreWidget
  const clearer = onClearAll ?? clearRecycleBin

  const handleRestore = useCallback((index: number) => {
    restorer(index)
  }, [restorer])

  const handleClearAll = useCallback(() => {
    clearer()
    setShowConfirm(false)
    setExpanded(false)
  }, [clearer])

  if (!visible) return null

  if (placement === 'toolbar') {
    return (
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? 'Collapse recycle bin' : 'Expand recycle bin'}
          style={{
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px',
            padding: '0 12px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--hover-bg)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <TrashSimple size={15} style={{ color: 'var(--text-muted)' }} />
          Recycle Bin
          {items.length > 0 && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                background: 'var(--bg-elevated)',
                padding: '1px 7px',
                borderRadius: '999px',
              }}
            >
              {items.length}
            </span>
          )}
        </button>

        {expanded && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: '520px',
              minHeight: '92px',
              zIndex: 'var(--z-modal)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
              overflow: 'auto',
            }}
          >
            {items.length === 0 ? (
              <div style={{ flex: 1, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                No removed widgets
              </div>
            ) : showConfirm ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
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
                  Clear All
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
                  Keep
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '8px', overflow: 'auto', flex: 1 }}>
                  {items.map((item, index) => {
                    const def = getWidget(item.pluginId)
                    const Icon = def?.icon ? ICON_MAP[def.icon] || Cube : Cube
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
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '58px',
        right: '360px',
        width: expanded ? 'min(560px, calc(100vw - 620px))' : '190px',
        zIndex: 'var(--z-modal)',
        background: 'var(--bg-card-solid)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
        transition: 'height 250ms var(--ease-spring), width 250ms var(--ease-spring)',
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
