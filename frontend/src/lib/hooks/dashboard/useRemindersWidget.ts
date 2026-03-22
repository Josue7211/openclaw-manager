import { useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-data'
import type { Reminder } from '@/lib/types'

const REMINDERS_KEY = ['reminders'] as const

const DEMO_REMINDERS: Reminder[] = [
  { id: 'demo-r1', title: 'Review pull request', completed: false, priority: 1, list: 'Work', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r2', title: 'Buy groceries', completed: false, priority: 3, list: 'Personal', dueDate: new Date().toISOString().slice(0, 10) },
  { id: 'demo-r3', title: 'Deploy staging build', completed: false, priority: 2, list: 'Work', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) },
  { id: 'demo-r4', title: 'Update documentation', completed: true, priority: 3, list: 'Work', dueDate: null },
]

export function useRemindersWidget() {
  const _demo = isDemoMode()
  const queryClient = useQueryClient()

  const { data, isSuccess } = useQuery<{ reminders?: Reminder[] }>({
    queryKey: REMINDERS_KEY,
    queryFn: () => api.get<{ reminders?: Reminder[] }>('/api/reminders'),
    enabled: !_demo,
  })

  const allReminders = _demo ? DEMO_REMINDERS : (data?.reminders ?? [])

  const todayReminders = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allReminders.filter(
      (r: Reminder) => !r.completed && r.dueDate && r.dueDate <= today,
    )
  }, [allReminders])

  const pendingCount = useMemo(
    () => allReminders.filter((r: Reminder) => !r.completed).length,
    [allReminders],
  )

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await api.patch('/api/reminders', { id, completed: !completed })
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: REMINDERS_KEY })
      const prev = queryClient.getQueryData(REMINDERS_KEY)
      queryClient.setQueryData(REMINDERS_KEY, (old: { reminders?: Reminder[] } | undefined) => ({
        ...old,
        reminders: (old?.reminders ?? []).map(r =>
          r.id === id ? { ...r, completed: !completed } : r,
        ),
      }))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(REMINDERS_KEY, ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: REMINDERS_KEY })
    },
  })

  const toggleReminder = useCallback(
    (id: string, completed: boolean) => toggleMutation.mutate({ id, completed }),
    [toggleMutation],
  )

  return {
    reminders: allReminders,
    todayReminders,
    pendingCount,
    toggleReminder,
    mounted: _demo || isSuccess,
  }
}
