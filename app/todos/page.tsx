'use client'

import { useEffect, useState, useCallback } from 'react'
import { CheckSquare, Plus, Flame } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getCached, setCache } from '@/lib/page-cache'

interface Todo {
  id: string
  text: string
  done: boolean
  created_at: string
  due_date?: string | null
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function getDueDateStatus(due_date: string | null | undefined): 'overdue' | 'today' | 'future' | null {
  if (!due_date) return null
  const today = todayISO()
  if (due_date < today) return 'overdue'
  if (due_date === today) return 'today'
  return 'future'
}

function DueDateBadge({ due_date }: { due_date: string | null | undefined }) {
  const status = getDueDateStatus(due_date)
  if (!status || !due_date) return null

  const styles: Record<string, { bg: string; color: string; label: string }> = {
    overdue: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', label: 'Overdue' },
    today: { bg: 'rgba(250,204,21,0.12)', color: '#fbbf24', label: 'Today' },
    future: { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)', label: due_date },
  }
  const s = styles[status]
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '999px',
      background: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {s.label}
    </span>
  )
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>(getCached<Todo[]>('todos') || [])
  const [todoInput, setTodoInput] = useState('')
  const [mounted, setMounted] = useState(false)
  const [hasDueDateSupport, setHasDueDateSupport] = useState(false)

  const fetchTodos = useCallback(() => {
    fetch('/api/todos').then(r => r.json()).then(d => {
      const fetched: Todo[] = d.todos || []
      setTodos(fetched)
      setCache('todos', fetched)
      // Detect due_date column support: if any todo has the key (even null)
      if (fetched.length > 0 && 'due_date' in fetched[0]) {
        setHasDueDateSupport(true)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchTodos()
    setMounted(true)

    if (!supabase) return

    const channel = supabase
      .channel('todos-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => fetchTodos())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchTodos])

  const addTodo = async () => {
    if (!todoInput.trim()) return
    await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: todoInput }) })
    setTodoInput('')
  }

  const toggleTodo = async (id: string, done: boolean) => {
    await fetch('/api/todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, done: !done }) })
  }

  const deleteTodo = async (id: string) => {
    await fetch('/api/todos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  }

  const updateDueDate = async (id: string, due_date: string | null) => {
    // Optimistic update
    setTodos(prev => prev.map(t => t.id === id ? { ...t, due_date } : t))
    await fetch('/api/todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, due_date: due_date || null }),
    }).catch(() => { fetchTodos() })
  }

  const pending = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)
  const today = todayISO()

  // Today's Focus: overdue + due today, sorted by due date asc, then creation date asc, top 3
  const focusTodos = pending
    .filter(t => t.due_date && t.due_date <= today)
    .sort((a, b) => {
      if (a.due_date! < b.due_date!) return -1
      if (a.due_date! > b.due_date!) return 1
      return (a.created_at || '').localeCompare(b.created_at || '')
    })
    .slice(0, 3)

  // Pending sorted by due date asc (nulls last), then creation date asc
  const sortedPending = [...pending].sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date && !b.due_date) return -1
    if (!a.due_date && b.due_date) return 1
    return (a.created_at || '').localeCompare(b.created_at || '')
  })

  const focusIds = new Set(focusTodos.map(t => t.id))

  return (
    <div style={{ maxWidth: '640px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <CheckSquare size={20} style={{ color: 'var(--green)' }} />
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>Todos</h1>
          {mounted && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {pending.length} pending
            </span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          real-time · personal task list
        </p>
      </div>

      {/* Add input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          value={todoInput}
          onChange={e => setTodoInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add a new task..."
          style={{
            flex: 1, background: 'rgba(22, 22, 28, 0.65)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px', fontSize: '13px',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <button
          onClick={addTodo}
          style={{
            background: 'var(--green)', border: 'none', borderRadius: '10px', color: '#fff',
            padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {mounted && (
        <>
          {/* Today's Focus section */}
          {focusTodos.length > 0 && (
            <div style={{
              marginBottom: '28px', padding: '16px 18px',
              background: 'rgba(239,68,68,0.06)', borderRadius: '16px',
              border: '1px solid rgba(239,68,68,0.18)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
                <Flame size={13} style={{ color: '#f87171' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Today&apos;s Focus
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {focusTodos.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 12px', borderRadius: '10px',
                    background: 'rgba(22, 22, 28, 0.65)', border: '1px solid rgba(239,68,68,0.15)',
                  }}>
                    <input
                      type="checkbox" checked={false} onChange={() => toggleTodo(t.id, t.done)}
                      style={{ cursor: 'pointer', accentColor: 'var(--green)', width: '15px', height: '15px', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.text}</span>
                    <DueDateBadge due_date={t.due_date} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending todos */}
          {pending.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                Pending — {pending.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sortedPending.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                    background: focusIds.has(t.id) ? 'rgba(239,68,68,0.05)' : 'rgba(22, 22, 28, 0.65)',
                    borderRadius: '10px',
                    border: focusIds.has(t.id) ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--border)',
                    transition: 'border-color 0.15s',
                  }}>
                    <input
                      type="checkbox" checked={false} onChange={() => toggleTodo(t.id, t.done)}
                      style={{ cursor: 'pointer', accentColor: 'var(--green)', width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.text}</span>
                    {hasDueDateSupport && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <DueDateBadge due_date={t.due_date} />
                        <input
                          type="date"
                          value={t.due_date || ''}
                          onChange={e => updateDueDate(t.id, e.target.value || null)}
                          title="Set due date"
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)',
                            borderRadius: '10px', padding: '3px 6px', fontSize: '11px',
                            color: 'var(--text-muted)', cursor: 'pointer', outline: 'none',
                            colorScheme: 'dark',
                          }}
                        />
                      </div>
                    )}
                    <button onClick={() => deleteTodo(t.id)} className="btn-delete">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done todos */}
          {done.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                Completed — {done.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {done.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px',
                    border: '1px solid rgba(59,165,92,0.15)',
                  }}>
                    <input
                      type="checkbox" checked onChange={() => toggleTodo(t.id, t.done)}
                      style={{ cursor: 'pointer', accentColor: 'var(--green)', width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'line-through', lineHeight: 1.4 }}>{t.text}</span>
                    <button onClick={() => deleteTodo(t.id)} className="btn-delete">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {todos.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
              No todos yet — add one above
            </div>
          )}
        </>
      )}
    </div>
  )
}
