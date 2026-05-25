import React, { useMemo, useState } from 'react'
import { ArrowRight, CheckSquare } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { SkeletonRows } from '@/components/Skeleton'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import { useRemindersWidget } from '@/lib/hooks/dashboard/useRemindersWidget'
import { useTodosWidget } from '@/lib/hooks/dashboard/useTodosWidget'
import type { WidgetProps } from '@/lib/widget-registry'
import type { Reminder, Todo } from '@/lib/types'

type WidgetTask = {
  key: string
  id: string
  source: 'todo' | 'reminder'
  title: string
  completed: boolean
  dueDate?: string | null
}

export const TodosWidget = React.memo(function TodosWidget({ size, config }: WidgetProps) {
  const { todos, focusTodos, pendingCount, toggleMutation, mounted } = useTodosWidget()
  const {
    reminders,
    todayReminders,
    pendingCount: reminderPendingCount,
    toggleReminder,
    mounted: remindersMounted,
    isError: remindersQueryError,
    bridgeError,
  } = useRemindersWidget()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const demo = isDemoMode()
  const [newText, setNewText] = useState('')

  const maxItems = Number(config.maxItems ?? 5)
  const showCompleted = Boolean(config.showCompleted ?? false)
  const filter = String(config.filter ?? 'focus')
  const compact = size.w <= 3
  const remindersUnavailable = !demo && (remindersQueryError || Boolean(bridgeError))

  const createReminderMutation = useMutation({
    mutationFn: async (title: string) => {
      await api.post('/api/reminders', {
        title,
        dueDate: null,
        list: 'Reminders',
        priority: 0,
        notes: '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
    },
  })

  const displayTasks = useMemo(() => {
    let todoItems: Todo[]
    if (filter === 'focus') {
      todoItems = focusTodos
    } else if (filter === 'pending') {
      todoItems = todos.filter((todo: Todo) => !todo.done)
    } else {
      todoItems = todos
    }
    if (!showCompleted) todoItems = todoItems.filter((todo: Todo) => !todo.done)

    const reminderItems = filter === 'focus'
      ? (todayReminders.length > 0 ? todayReminders : reminders.filter((reminder: Reminder) => !reminder.completed))
      : reminders.filter((reminder: Reminder) => showCompleted || !reminder.completed)

    const tasks: WidgetTask[] = [
      ...todoItems.map((todo): WidgetTask => ({
        key: `todo:${todo.id}`,
        id: todo.id,
        source: 'todo',
        title: todo.text,
        completed: todo.done,
        dueDate: todo.due_date,
      })),
      ...reminderItems.map((reminder): WidgetTask => ({
        key: `reminder:${reminder.id}`,
        id: reminder.id,
        source: 'reminder',
        title: reminder.title,
        completed: reminder.completed,
        dueDate: reminder.dueDate,
      })),
    ].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate && !b.dueDate) return -1
      if (!a.dueDate && b.dueDate) return 1
      return a.title.localeCompare(b.title)
    })

    const limit = compact ? Math.min(maxItems, 3) : maxItems
    return tasks.slice(0, limit)
  }, [compact, filter, focusTodos, maxItems, reminders, showCompleted, todayReminders, todos])

  const handleAdd = () => {
    const text = newText.trim()
    if (!text || remindersUnavailable) return
    if (!demo) createReminderMutation.mutate(text)
    setNewText('')
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="card" style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <CheckSquare size={14} style={{ color: 'var(--accent)' }} />
        <span style={{
          fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
          letterSpacing: '0.1em', textTransform: 'uppercase', flex: 1,
        }}>
          Reminders
        </span>
        {mounted && (pendingCount + reminderPendingCount) > 0 && (
          <span style={{
            fontSize: '10px', padding: '2px 6px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--text-on-accent)',
            fontWeight: 600, lineHeight: 1,
          }}>
            {pendingCount + reminderPendingCount}
          </span>
        )}
      </div>

      {!mounted || !remindersMounted ? (
        <SkeletonRows count={3} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minHeight: 0 }}>
          {displayTasks.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
              No reminders for today
            </div>
          ) : (
            displayTasks.map((task) => (
              <label
                key={task.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s',
                }}
                className="hover-bg"
              >
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => {
                    if (task.source === 'todo') {
                      toggleMutation.mutate({ id: task.id, done: task.completed })
                    } else {
                      toggleReminder(task.id, task.completed)
                    }
                  }}
                  aria-label={`Toggle ${task.title}`}
                style={{
                  width: '14px', height: '14px', accentColor: 'var(--accent)',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                />
                <span style={{
                  fontSize: '12px', color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: task.completed ? 'line-through' : 'none',
                  flex: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {task.title}
                </span>
                {task.dueDate && (
                  <span style={{
                    fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0,
                    fontFamily: 'monospace',
                  }}>
                    {formatDueDate(task.dueDate)}
                  </span>
                )}
              </label>
            ))
          )}

          {!compact && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={newText}
                onChange={event => setNewText(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={remindersUnavailable || createReminderMutation.isPending}
                placeholder={remindersUnavailable ? 'Reminders unavailable' : 'Add a reminder...'}
                aria-label="Add a new reminder"
                style={{
                  width: '100%', fontSize: '12px', padding: '6px 8px',
                  background: 'var(--bg-white-03)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text-primary)', outline: 'none',
                  cursor: remindersUnavailable ? 'not-allowed' : 'text',
                }}
              />
            </div>
          )}

          <button
            onClick={() => navigate('/todos')}
            aria-label="View all reminders"
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
  return dateStr.slice(5)
}
