import React, { useState, useMemo } from 'react'
import { CheckSquare, ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from '@/components/Skeleton'
import { useTodosWidget } from '@/lib/hooks/dashboard/useTodosWidget'
import type { WidgetProps } from '@/lib/widget-registry'
import type { Todo } from '@/lib/types'

export const TodosWidget = React.memo(function TodosWidget({ size, config }: WidgetProps) {
  const { todos, focusTodos, pendingCount, addMutation, toggleMutation, mounted } = useTodosWidget()
  const navigate = useNavigate()
  const [newText, setNewText] = useState('')

  const maxItems = Number(config.maxItems ?? 5)
  const showCompleted = Boolean(config.showCompleted ?? false)
  const filter = String(config.filter ?? 'focus')

  const compact = size.w <= 3
  const displayTodos = useMemo(() => {
    let items: Todo[]
    if (filter === 'focus') {
      items = focusTodos
    } else if (filter === 'pending') {
      items = todos.filter((t: Todo) => !t.done)
    } else {
      items = todos
    }
    if (!showCompleted) items = items.filter((t: Todo) => !t.done)
    const limit = compact ? Math.min(maxItems, 3) : maxItems
    return items.slice(0, limit)
  }, [todos, focusTodos, maxItems, showCompleted, filter, compact])

  const handleAdd = () => {
    const text = newText.trim()
    if (!text) return
    addMutation.mutate(text)
    setNewText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          {compact ? "Today's Focus" : "Today's Focus"}
        </span>
        {mounted && pendingCount > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {pendingCount}
          </span>
        )}
      </div>

      {/* Content */}
      {!mounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {displayTodos.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No focus tasks for today
            </div>
          ) : (
            displayTodos.map((todo: Todo) => (
              <label
                key={todo.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
                }}
                className="hover-bg"
              >
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleMutation.mutate({ id: todo.id, done: todo.done })}
                  aria-label={`Toggle ${todo.text}`}
                  style={{
                    width: '14px', height: '14px', accentColor: 'var(--accent)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: '12px', color: todo.done ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: todo.done ? 'line-through' : 'none',
                  flex: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {todo.text}
                </span>
                {todo.due_date && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {formatDueDate(todo.due_date)}
                  </span>
                )}
              </label>
            ))
          )}

          {/* Add input (full view only) */}
          {!compact && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a todo..."
                aria-label="Add a new todo"
                style={{
                  width: '100%', fontSize: '12px', padding: '6px 8px',
                  background: 'var(--bg-white-03)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>
          )}

          {/* View all link */}
          <button
            onClick={() => navigate('/todos')}
            aria-label="View all todos"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto',
              paddingTop: '8px', fontSize: '11px', color: 'var(--accent)',
              background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View all <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  )
})

function formatDueDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr < yesterday) return 'Overdue'
  return dateStr.slice(5) // MM-DD
}
