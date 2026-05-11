


import { useEffect, useState, useRef } from 'react'
import { CheckSquare, Plus, Fire, ListChecks } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { emit } from '@/lib/event-bus'
import { queryKeys } from '@/lib/query-keys'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'
import { todayISO } from '@/lib/utils'
import { SkeletonList } from '@/components/Skeleton'
import { useTodos } from '@/lib/hooks/useTodos'
import { PageHeader } from '@/components/PageHeader'
import { isDemoMode, DEMO_TODOS } from '@/lib/demo-data'
import { DemoBadge } from '@/components/DemoModeBanner'
import type { Todo } from '@/lib/types'

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
    overdue: { bg: 'var(--red-500-a12)', color: 'var(--red)', label: 'Overdue' },
    today: { bg: 'var(--yellow-bright-a12)', color: 'var(--warning)', label: 'Today' },
    future: { bg: 'var(--hover-bg)', color: 'var(--text-muted)', label: due_date },
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
  const _demo = isDemoMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const addInputRef = useRef<HTMLInputElement>(null)
  const { addMutation, toggleMutation, deleteMutation, invalidateTodos } = useTodos()
  const [localDemoTodos, setLocalDemoTodos] = useState<Todo[]>(DEMO_TODOS)

  // Auto-focus add input when navigated with ?focus=add
  useEffect(() => {
    if (searchParams.get('focus') === 'add') {
      requestAnimationFrame(() => addInputRef.current?.focus())
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: todosData, isLoading } = useQuery<{ todos: Todo[] }>({
    queryKey: queryKeys.todos,
    queryFn: () => api.get<{ todos: Todo[] }>('/api/todos'),
    enabled: !_demo,
  })

  const todos = _demo ? localDemoTodos : (todosData?.todos ?? [])
  const [todoInput, setTodoInput] = useState('')
  const [todoDueDate, setTodoDueDate] = useState('')
  const [hasDueDateSupport, setHasDueDateSupport] = useState(true)
  const [mutationError, setMutationError] = useState<string | null>(null)

  // Detect due_date column support
  useEffect(() => {
    if (todos.length > 0 && 'due_date' in todos[0]) {
      setHasDueDateSupport(true)
    }
  }, [todos])

  useTableRealtime('todos', {
    onEvent: () => {
      invalidateTodos()
      emit('todo-changed', null, 'supabase')
    },
  })

  const updateDueDateMutation = useMutation({
    mutationFn: async ({ id, due_date }: { id: string; due_date: string | null }) => {
      await api.patch('/api/todos', { id, due_date: due_date || null })
    },
    onSuccess: () => invalidateTodos(),
  })

  const addTodo = async () => {
    if (!todoInput.trim()) return
    if (_demo) {
      setLocalDemoTodos(prev => [...prev, {
        id: `demo-${Date.now()}`,
        text: todoInput.trim(),
        done: false,
        due_date: todoDueDate || null,
      }])
      setTodoInput('')
      setTodoDueDate('')
      return
    }
    try {
      await addMutation.mutateAsync({ text: todoInput.trim(), due_date: todoDueDate || null })
      setTodoInput('')
      setTodoDueDate('')
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not add todo')
    }
  }

  const toggleTodo = async (id: string, done: boolean) => {
    if (_demo) {
      setLocalDemoTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
      return
    }
    try {
      await toggleMutation.mutateAsync({ id, done })
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not update todo')
    }
  }

  const deleteTodo = async (id: string) => {
    if (_demo) {
      setLocalDemoTodos(prev => prev.filter(t => t.id !== id))
      return
    }
    try {
      await deleteMutation.mutateAsync(id)
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not delete todo')
    }
  }

  const updateDueDate = async (id: string, due_date: string | null) => {
    if (_demo) {
      setLocalDemoTodos(prev => prev.map(t => t.id === id ? { ...t, due_date } : t))
      return
    }
    try {
      await updateDueDateMutation.mutateAsync({ id, due_date })
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not update due date')
    }
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
    <div style={{ maxWidth: '960px', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <CheckSquare size={20} style={{ color: 'var(--secondary)' }} />
          <PageHeader defaultTitle="Todos" defaultSubtitle="real-time · personal task list" />
          {_demo && <DemoBadge />}
          {(!isLoading || _demo) && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {pending.length} pending
            </span>
          )}
        </div>
      </div>

      {/* Add input */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 140px auto', gap: '8px', marginBottom: mutationError ? '10px' : '24px' }}>
        <input
          ref={addInputRef}
          value={todoInput}
          onChange={e => setTodoInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add a new task..."
          aria-label="Add todo"
          style={{
            flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px', fontSize: '13px',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
        <input
          type="date"
          value={todoDueDate}
          onChange={e => setTodoDueDate(e.target.value)}
          aria-label="New todo due date"
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '9px 10px', fontSize: '12px',
            color: 'var(--text-muted)', outline: 'none', colorScheme: 'dark',
          }}
        />
        <button
          onClick={addTodo}
          disabled={!todoInput.trim() || addMutation.isPending}
          style={{
            background: !todoInput.trim() || addMutation.isPending ? 'var(--bg-elevated)' : 'var(--secondary)',
            border: 'none', borderRadius: '10px',
            color: !todoInput.trim() || addMutation.isPending ? 'var(--text-muted)' : 'var(--text-on-color)',
            padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {mutationError && (
        <div style={{
          marginBottom: '18px',
          padding: '10px 12px',
          border: '1px solid var(--red-500-a20)',
          borderRadius: '8px',
          background: 'var(--red-500-a12)',
          color: 'var(--red)',
          fontSize: '12px',
        }}>
          {mutationError}
        </div>
      )}

      <div aria-live="polite" aria-busy={isLoading && !_demo}>
      {isLoading && !_demo ? (
        <SkeletonList count={3} lines={3} />
      ) : (
        <>
          {/* Today's Focus section */}
          {focusTodos.length > 0 && (
            <div style={{
              marginBottom: '28px', padding: '16px 18px',
              background: 'var(--red-500-a12)', borderRadius: '16px',
              border: '1px solid var(--red-500-a20)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
                <Fire size={13} style={{ color: 'var(--red)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Today&apos;s Focus
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {focusTodos.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 12px', borderRadius: '10px',
                    background: 'var(--bg-card)', border: '1px solid var(--red-500-a12)',
                  }}>
                    <input
                      type="checkbox" checked={false} onChange={() => toggleTodo(t.id, t.done)}
                      aria-label={`Mark "${t.text}" as done`}
                      style={{ cursor: 'pointer', accentColor: 'var(--secondary)', width: '15px', height: '15px', flexShrink: 0 }}
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
                    background: focusIds.has(t.id) ? 'var(--red-500-a12)' : 'var(--bg-card)',
                    borderRadius: '10px',
                    border: focusIds.has(t.id) ? '1px solid var(--red-500-a20)' : '1px solid var(--border)',
                    transition: 'border-color 0.15s',
                  }}>
                    <input
                      type="checkbox" checked={false} onChange={() => toggleTodo(t.id, t.done)}
                      aria-label={`Mark "${t.text}" as done`}
                      style={{ cursor: 'pointer', accentColor: 'var(--secondary)', width: '16px', height: '16px', flexShrink: 0 }}
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
                          aria-label={`Set due date for "${t.text}"`}
                          style={{
                            background: 'var(--hover-bg)', border: '1px solid var(--border)',
                            borderRadius: '10px', padding: '3px 6px', fontSize: '11px',
                            color: 'var(--text-muted)', cursor: 'pointer', outline: 'none',
                            colorScheme: 'dark',
                          }}
                        />
                      </div>
                    )}
                    <button onClick={() => deleteTodo(t.id)} className="btn-delete" aria-label="Delete todo">✕</button>
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
                    background: 'var(--hover-bg)', borderRadius: '10px',
                    border: '1px solid var(--secondary-a15)',
                  }}>
                    <input
                      type="checkbox" checked onChange={() => toggleTodo(t.id, t.done)}
                      aria-label={`Mark "${t.text}" as not done`}
                      style={{ cursor: 'pointer', accentColor: 'var(--secondary)', width: '16px', height: '16px', flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'line-through', lineHeight: 1.4 }}>{t.text}</span>
                    <button onClick={() => deleteTodo(t.id)} className="btn-delete" aria-label="Delete todo">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {todos.length === 0 && (
            <EmptyState icon={ListChecks} title="All clear" description="You have no tasks. Enjoy the free time." />
          )}
        </>
      )}
      </div>
    </div>
  )
}
