import { useEffect, useMemo, useRef, useState } from 'react'
import { Fire, ListChecks, Plus, Trash } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { DemoBadge } from '@/components/DemoModeBanner'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonList } from '@/components/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { api } from '@/lib/api'
import { isDemoMode, DEMO_TODOS } from '@/lib/demo-data'
import { emit } from '@/lib/event-bus'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'
import { useTodos } from '@/lib/hooks/useTodos'
import { queryKeys } from '@/lib/query-keys'
import type { Reminder, Todo } from '@/lib/types'
import { todayISO } from '@/lib/utils'

type TaskSource = 'todo' | 'reminder'
type TaskFilter = 'all' | 'today' | 'scheduled' | 'flagged' | 'completed'

interface RemindersResponse {
  reminders?: Reminder[]
  error?: string
  message?: string
}

type UnifiedTask = {
  key: string
  id: string
  source: TaskSource
  title: string
  completed: boolean
  dueDate: string | null
  createdAt: string
  priority: number
  notes?: string | null
  list?: string
}

const DEMO_REMINDERS: Reminder[] = [
  { id: 'demo-r1', title: 'Review pull request', completed: false, priority: 1, notes: null, list: 'Work', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r2', title: 'Buy groceries', completed: false, priority: 9, notes: null, list: 'Personal', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r3', title: 'Deploy staging build', completed: false, priority: 5, notes: 'Run integration tests first', list: 'Work', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
]

function getDueDateStatus(dueDate: string | null): 'overdue' | 'today' | 'future' | null {
  if (!dueDate) return null
  const today = todayISO()
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'future'
}

function formatDueDate(dueDate: string | null): string | null {
  if (!dueDate) return null
  const status = getDueDateStatus(dueDate)
  if (status === 'overdue') return 'Overdue'
  if (status === 'today') return 'Today'
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  if (dueDate === tomorrow) return 'Tomorrow'
  return dueDate
}

function dueColor(dueDate: string | null): string {
  const status = getDueDateStatus(dueDate)
  if (status === 'overdue') return 'var(--red)'
  if (status === 'today') return 'var(--warning)'
  return 'var(--text-muted)'
}

function toTodoTask(todo: Todo): UnifiedTask {
  return {
    key: `todo:${todo.id}`,
    id: todo.id,
    source: 'todo',
    title: todo.text,
    completed: todo.done,
    dueDate: todo.due_date ?? null,
    createdAt: todo.created_at ?? todo.createdAt ?? '',
    priority: 0,
  }
}

function toReminderTask(reminder: Reminder): UnifiedTask {
  return {
    key: `reminder:${reminder.id}`,
    id: reminder.id,
    source: 'reminder',
    title: reminder.title,
    completed: reminder.completed,
    dueDate: reminder.dueDate ?? null,
    createdAt: '',
    priority: reminder.priority ?? 0,
    notes: reminder.notes,
    list: reminder.list,
  }
}

function sortTasks(a: UnifiedTask, b: UnifiedTask): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate && !b.dueDate) return -1
  if (!a.dueDate && b.dueDate) return 1
  if (a.priority !== b.priority) return a.priority === 1 ? -1 : b.priority === 1 ? 1 : 0
  return a.createdAt.localeCompare(b.createdAt)
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  deleting,
}: {
  task: UnifiedTask
  onToggle: (task: UnifiedTask) => void
  onDelete: (task: UnifiedTask) => void
  deleting: boolean
}) {
  const due = formatDueDate(task.dueDate)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 14px',
        background: task.completed ? 'var(--hover-bg)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-hover)',
        boxShadow: 'inset 0 1px 0 var(--bg-white-03)',
      }}
    >
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        aria-label={`Toggle "${task.title}"`}
        style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0, marginTop: '1px' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {task.priority === 1 && <span style={{ color: 'var(--red)', fontSize: '11px', fontWeight: 800 }}>!!</span>}
          <span
            style={{
              fontSize: '13px',
              color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)',
              textDecoration: task.completed ? 'line-through' : 'none',
              lineHeight: 1.4,
            }}
          >
            {task.title}
          </span>
        </div>
        {task.notes && (
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.notes}
          </div>
        )}
      </div>
      {due && (
        <span style={{ fontSize: '11px', fontWeight: 600, color: dueColor(task.dueDate), flexShrink: 0, fontFamily: 'monospace', marginTop: '3px' }}>
          {due}
        </span>
      )}
      <button
        onClick={() => onDelete(task)}
        disabled={deleting}
        className="btn-delete"
        aria-label={`Delete "${task.title}"`}
        style={{ flexShrink: 0 }}
      >
        <Trash size={13} />
      </button>
    </div>
  )
}

export default function TodosPage() {
  const demo = isDemoMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const addInputRef = useRef<HTMLInputElement>(null)
  const { toggleMutation, deleteMutation, invalidateTodos } = useTodos()
  const [localDemoTodos, setLocalDemoTodos] = useState<Todo[]>(DEMO_TODOS)
  const [localDemoReminders, setLocalDemoReminders] = useState<Reminder[]>(DEMO_REMINDERS)
  const [taskInput, setTaskInput] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (searchParams.get('focus') === 'add') {
      requestAnimationFrame(() => addInputRef.current?.focus())
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const { data: todosData, isLoading: todosLoading } = useQuery<{ todos: Todo[] }>({
    queryKey: queryKeys.todos,
    queryFn: () => api.get<{ todos: Todo[] }>('/api/todos'),
    enabled: !demo,
  })

  const {
    data: remindersData,
    isLoading: remindersLoading,
    isError: remindersQueryError,
    refetch: refetchReminders,
  } = useQuery<RemindersResponse>({
    queryKey: ['reminders'],
    queryFn: () => api.get<RemindersResponse>('/api/reminders'),
    enabled: !demo,
  })

  useTableRealtime('todos', {
    onEvent: () => {
      invalidateTodos()
      emit('todo-changed', null, 'supabase')
    },
  })

  const reminderToggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await api.patch('/api/reminders', { id, completed })
    },
    onSuccess: () => refetchReminders(),
  })

  const reminderCreateMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/reminders', {
        title: taskInput.trim(),
        dueDate: taskDueDate || null,
        list: 'Reminders',
        priority: 0,
        notes: '',
      })
    },
    onSuccess: () => refetchReminders(),
  })

  const reminderDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/reminders?id=${encodeURIComponent(id)}`)
    },
    onSuccess: () => refetchReminders(),
  })

  const todos = demo ? localDemoTodos : (todosData?.todos ?? [])
  const reminders = demo ? localDemoReminders : (remindersData?.reminders ?? [])
  const remindersUnavailable = !demo && (
    remindersQueryError ||
    remindersData?.error === 'bridge_unreachable' ||
    remindersData?.error === 'bridge_not_configured' ||
    remindersData?.error === 'missing_credentials'
  )

  const tasks = useMemo(() => {
    return [
      ...todos.map(toTodoTask),
      ...reminders.map(toReminderTask),
    ].sort(sortTasks)
  }, [todos, reminders])

  const today = todayISO()
  const pendingTasks = tasks.filter(task => !task.completed)
  const completedTasks = tasks.filter(task => task.completed)
  const focusTasks = pendingTasks.filter(task => task.dueDate && task.dueDate <= today).slice(0, 3)
  const focusKeys = new Set(focusTasks.map(task => task.key))

  const filteredTasks = useMemo(() => {
    if (filter === 'completed') return completedTasks
    let list = pendingTasks
    if (filter === 'today') list = list.filter(task => task.dueDate && task.dueDate <= today)
    if (filter === 'scheduled') list = list.filter(task => task.dueDate)
    if (filter === 'flagged') list = list.filter(task => task.priority === 1)
    return list
  }, [completedTasks, filter, pendingTasks, today])

  const tabs: { id: TaskFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: pendingTasks.length },
    { id: 'today', label: 'Today', count: pendingTasks.filter(task => task.dueDate && task.dueDate <= today).length },
    { id: 'scheduled', label: 'Scheduled', count: pendingTasks.filter(task => task.dueDate).length },
    { id: 'flagged', label: 'Flagged', count: pendingTasks.filter(task => task.priority === 1).length },
    { id: 'completed', label: 'Done', count: completedTasks.length },
  ]

  const addTask = async () => {
    const title = taskInput.trim()
    if (!title) return
    if (demo) {
      setLocalDemoReminders(prev => [...prev, { id: `demo-r-${Date.now()}`, title, completed: false, dueDate: taskDueDate || null, priority: 0, notes: null, list: 'Reminders' }])
      setTaskInput('')
      setTaskDueDate('')
      return
    }
    try {
      await reminderCreateMutation.mutateAsync()
      setTaskInput('')
      setTaskDueDate('')
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Could not add reminder')
    }
  }

  const toggleTask = async (task: UnifiedTask) => {
    try {
      if (demo) {
        if (task.source === 'todo') {
          setLocalDemoTodos(prev => prev.map(todo => todo.id === task.id ? { ...todo, done: !todo.done } : todo))
        } else {
          setLocalDemoReminders(prev => prev.map(reminder => reminder.id === task.id ? { ...reminder, completed: !reminder.completed } : reminder))
        }
        return
      }
      if (task.source === 'todo') {
        await toggleMutation.mutateAsync({ id: task.id, done: task.completed })
      } else {
        await reminderToggleMutation.mutateAsync({ id: task.id, completed: !task.completed })
      }
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : `Could not update ${task.source}`)
    }
  }

  const deleteTask = async (task: UnifiedTask) => {
    setDeletingKeys(prev => new Set(prev).add(task.key))
    try {
      if (demo) {
        if (task.source === 'todo') {
          setLocalDemoTodos(prev => prev.filter(todo => todo.id !== task.id))
        } else {
          setLocalDemoReminders(prev => prev.filter(reminder => reminder.id !== task.id))
        }
        return
      }
      if (task.source === 'todo') {
        await deleteMutation.mutateAsync(task.id)
      } else {
        await reminderDeleteMutation.mutateAsync(task.id)
      }
      setMutationError(null)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : `Could not delete ${task.source}`)
    } finally {
      setDeletingKeys(prev => {
        const next = new Set(prev)
        next.delete(task.key)
        return next
      })
    }
  }

  const loading = !demo && (todosLoading || remindersLoading)
  const reminderAddDisabled = remindersUnavailable

  return (
    <div style={{ maxWidth: '960px', width: '100%' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <ListChecks size={20} style={{ color: 'var(--secondary)' }} />
          <PageHeader defaultTitle="Reminders" defaultSubtitle="one list" />
          {demo && <DemoBadge />}
          {!loading && (
            <span className="badge badge-green" style={{ marginLeft: '4px' }}>
              {pendingTasks.length} pending
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 140px auto', gap: '8px', marginBottom: mutationError || remindersUnavailable ? '10px' : '20px' }}>
        <input
          ref={addInputRef}
          value={taskInput}
          onChange={event => setTaskInput(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && !reminderAddDisabled && addTask()}
          placeholder="Add a reminder..."
          aria-label="Add reminder"
          style={{
            minWidth: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius-xl)',
            padding: '11px 15px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            outline: 'none',
            boxShadow: 'inset 0 1px 0 var(--bg-white-03)',
          }}
        />
        <input
          type="date"
          value={taskDueDate}
          onChange={event => setTaskDueDate(event.target.value)}
          aria-label="Task due date"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-hover)',
            borderRadius: 'var(--radius-xl)',
            padding: '10px 12px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            outline: 'none',
            colorScheme: 'dark',
            boxShadow: 'inset 0 1px 0 var(--bg-white-03)',
          }}
        />
        <button
          onClick={addTask}
          disabled={!taskInput.trim() || reminderCreateMutation.isPending || reminderAddDisabled}
          style={{
            background: !taskInput.trim() || reminderAddDisabled ? 'var(--bg-elevated)' : 'var(--secondary)',
            border: '1px solid var(--secondary-a25)',
            borderRadius: 'var(--radius-xl)',
            color: !taskInput.trim() || reminderAddDisabled ? 'var(--text-muted)' : 'var(--text-on-color)',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: !taskInput.trim() || reminderAddDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {remindersUnavailable && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', border: '1px solid var(--warning-a25)', borderRadius: '8px', background: 'var(--warning-a12)', color: 'var(--warning)', fontSize: '12px' }}>
          Apple Reminders are unavailable.
        </div>
      )}

      {mutationError && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', border: '1px solid var(--red-500-a20)', borderRadius: '8px', background: 'var(--red-500-a12)', color: 'var(--red)', fontSize: '12px' }}>
          {mutationError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              background: filter === tab.id ? 'var(--secondary)' : 'var(--bg-panel)',
              color: filter === tab.id ? 'var(--text-on-color)' : 'var(--text-secondary)',
              border: filter === tab.id ? '1px solid var(--secondary)' : '1px solid var(--border)',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, background: filter === tab.id ? 'var(--bg-white-25)' : 'var(--bg-base)', borderRadius: '10px', padding: '1px 6px' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <SkeletonList count={4} lines={3} />
        ) : (
          <>
            {focusTasks.length > 0 && filter === 'all' && (
              <div style={{ marginBottom: '28px', padding: '16px 18px', background: 'var(--red-500-a12)', borderRadius: '16px', border: '1px solid var(--red-500-a20)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px' }}>
                  <Fire size={13} style={{ color: 'var(--red)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Today&apos;s Focus
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {focusTasks.map(task => (
                    <TaskRow key={task.key} task={task} onToggle={toggleTask} onDelete={deleteTask} deleting={deletingKeys.has(task.key)} />
                  ))}
                </div>
              </div>
            )}

            {filteredTasks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredTasks.map(task => (
                  <div key={task.key} style={{ opacity: focusKeys.has(task.key) && filter === 'all' ? 0.92 : 1 }}>
                    <TaskRow task={task} onToggle={toggleTask} onDelete={deleteTask} deleting={deletingKeys.has(task.key)} />
                  </div>
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <EmptyState icon={ListChecks} title="All clear" description="You have no reminders." />
            ) : (
              <EmptyState icon={ListChecks} title="Nothing here" description="No reminders match this filter." />
            )}
          </>
        )}
      </div>
    </div>
  )
}
