/**
 * KanbanBoard primitive -- column-based board with drag-and-drop cards.
 *
 * Config keys: title (string), columns (KanbanColumn[])
 * Uses native HTML5 Drag and Drop API (project pattern from SettingsModules.tsx).
 */

import React, { useState, useCallback, useRef } from 'react'
import { Kanban } from '@phosphor-icons/react'
import type { WidgetProps, WidgetConfigSchema } from '@/lib/widget-registry'
import { EmptyState } from '@/components/ui/EmptyState'
import { configString, configArray, resolveColor } from './shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KanbanCard {
  id: string
  title: string
  description?: string
}

interface KanbanColumn {
  id: string
  title: string
  color?: string
  items: KanbanCard[]
}

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export const configSchema: WidgetConfigSchema = {
  fields: [
    { key: 'title', label: 'Title', type: 'text', default: 'Kanban' },
  ],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const KanbanBoard = React.memo(function KanbanBoard({ config }: WidgetProps) {
  const title = configString(config, 'title', 'Kanban')
  const initialColumns = configArray<KanbanColumn>(config, 'columns')

  // Track config identity to reset state when config changes
  const configRef = useRef(initialColumns)
  const [columns, setColumns] = useState<KanbanColumn[]>(() =>
    structuredClone(initialColumns),
  )

  // Reset state if config.columns reference changes
  if (initialColumns !== configRef.current) {
    configRef.current = initialColumns
    setColumns(structuredClone(initialColumns))
  }

  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const handleDragStart = useCallback(
    (e: React.DragEvent, columnId: string, cardId: string) => {
      e.dataTransfer.setData('text/plain', `${columnId}:${cardId}`)
      e.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDragOverCol(columnId)
    },
    [],
  )

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, targetColumnId: string) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverCol(null)

      const data = e.dataTransfer.getData('text/plain')
      const sepIdx = data.indexOf(':')
      if (sepIdx === -1) return

      const sourceColumnId = data.slice(0, sepIdx)
      const cardId = data.slice(sepIdx + 1)

      if (sourceColumnId === targetColumnId) return

      setColumns(prev => {
        const next = structuredClone(prev)
        const srcCol = next.find(c => c.id === sourceColumnId)
        const tgtCol = next.find(c => c.id === targetColumnId)
        if (!srcCol || !tgtCol) return prev

        const cardIdx = srcCol.items.findIndex(c => c.id === cardId)
        if (cardIdx === -1) return prev

        const [card] = srcCol.items.splice(cardIdx, 1)
        tgtCol.items.push(card)
        return next
      })
    },
    [],
  )

  if (initialColumns.length === 0) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <EmptyState icon={Kanban} title="No columns" description="Add columns in widget config" />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {title && (
        <span
          style={{
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            padding: '12px 16px 8px',
          }}
        >
          {title}
        </span>
      )}

      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '0 12px 12px',
          overflowX: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        {columns.map(col => (
          <div
            key={col.id}
            onDragOver={e => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, col.id)}
            style={{
              flex: 1,
              minWidth: '140px',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 'var(--radius-md)',
              background: dragOverCol === col.id ? 'var(--hover-bg)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            {/* Column header */}
            <div
              style={{
                borderTop: `4px solid ${resolveColor(col.color ?? 'accent')}`,
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                {col.title}
              </span>
              <span
                className="kanban-count"
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  background: 'var(--hover-bg)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                }}
              >
                {col.items.length}
              </span>
            </div>

            {/* Cards */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '6px 8px',
                flex: 1,
                minHeight: '60px',
                overflowY: 'auto',
              }}
            >
              {col.items.map(card => (
                <div
                  key={card.id}
                  draggable="true"
                  onDragStart={e => handleDragStart(e, col.id, card.id)}
                  className="hover-bg-bright"
                  style={{
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    cursor: 'grab',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {card.title}
                  </div>
                  {card.description && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {card.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default KanbanBoard
