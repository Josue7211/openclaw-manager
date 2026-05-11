import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { Todo } from '@/lib/types'

export interface AddTodoInput {
  text: string
  due_date?: string | null
}

/**
 * Shared todo mutations (add / toggle / delete) with optimistic updates.
 * Used by both Todos.tsx and Personal.tsx.
 */
export function useTodos() {
  const queryClient = useQueryClient()

  const invalidateTodos = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.todos })
  }, [queryClient])

  const addMutation = useMutation({
    mutationFn: async (input: string | AddTodoInput) => {
      const payload = typeof input === 'string' ? { text: input } : input
      await api.post('/api/todos', payload)
    },
    onMutate: async (input) => {
      const payload = typeof input === 'string' ? { text: input } : input
      await queryClient.cancelQueries({ queryKey: queryKeys.todos })
      const prev = queryClient.getQueryData(queryKeys.todos)
      queryClient.setQueryData(queryKeys.todos, (old: { todos?: Todo[] } | undefined) => ({
        ...old,
        todos: [
          ...(old?.todos || []),
          {
            id: 'temp-' + Date.now(),
            text: payload.text,
            done: false,
            due_date: payload.due_date || null,
          } as Todo,
        ],
      }))
      return { prev }
    },
    onError: (_err, _text, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.todos, ctx.prev)
    },
    onSettled: () => invalidateTodos(),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      await api.patch('/api/todos', { id, done: !done })
    },
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos })
      const prev = queryClient.getQueryData(queryKeys.todos)
      queryClient.setQueryData(queryKeys.todos, (old: { todos?: Todo[] } | undefined) => ({
        ...old,
        todos: (old?.todos || []).map(t => t.id === id ? { ...t, done: !done } : t),
      }))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.todos, ctx.prev)
    },
    onSettled: () => invalidateTodos(),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/todos?id=${encodeURIComponent(id)}`)
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos })
      const prev = queryClient.getQueryData(queryKeys.todos)
      queryClient.setQueryData(queryKeys.todos, (old: { todos?: Todo[] } | undefined) => ({
        ...old,
        todos: (old?.todos || []).filter(t => t.id !== id),
      }))
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.todos, ctx.prev)
    },
    onSettled: () => invalidateTodos(),
  })

  return {
    addMutation,
    toggleMutation,
    deleteMutation,
    invalidateTodos,
  }
}
