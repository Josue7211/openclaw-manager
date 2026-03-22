import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode, DEMO_TODOS } from '@/lib/demo-data'
import { useTableRealtime } from '@/lib/hooks/useRealtimeSSE'
import { useTodos } from '@/lib/hooks/useTodos'
import type { Todo } from '@/lib/types'

export function useTodosWidget() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ todos?: Todo[] }>({
    queryKey: queryKeys.todos,
    queryFn: () => api.get<{ todos?: Todo[] }>('/api/todos'),
    enabled: !_demo,
  })

  useTableRealtime('todos', { queryKey: queryKeys.todos })

  const { addMutation, toggleMutation } = useTodos()

  const allTodos = _demo ? DEMO_TODOS : (data?.todos ?? [])

  const focusTodos = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return allTodos
      .filter((t: Todo) => !t.done && t.due_date && t.due_date <= today)
      .sort((a: Todo, b: Todo) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  }, [allTodos])

  const pendingCount = useMemo(
    () => allTodos.filter((t: Todo) => !t.done).length,
    [allTodos],
  )

  return {
    todos: allTodos,
    focusTodos,
    pendingCount,
    addMutation,
    toggleMutation,
    mounted: _demo || isSuccess,
  }
}
