import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'

export type CaptureRoute = 'todo' | 'idea' | 'note'

interface CaptureResult {
  route: CaptureRoute
  id?: string
}

/**
 * Hook for the Quick Capture dashboard widget.
 * Submits text directly to the chosen destination (todo, idea, or capture inbox as note).
 */
export function useQuickCapture() {
  const queryClient = useQueryClient()
  const [route, setRoute] = useState<CaptureRoute>('todo')
  const [successFlash, setSuccessFlash] = useState(false)

  const flashSuccess = useCallback(() => {
    setSuccessFlash(true)
    setTimeout(() => setSuccessFlash(false), 1200)
  }, [])

  const captureMutation = useMutation<CaptureResult, Error, string>({
    mutationFn: async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) throw new Error('Empty capture')

      if (route === 'todo') {
        const json = await api.post<{ todo?: { id: string } }>('/api/todos', { text: trimmed })
        return { route: 'todo', id: json.todo?.id }
      } else if (route === 'idea') {
        const json = await api.post<{ idea?: { id: string } }>('/api/ideas', { title: trimmed })
        return { route: 'idea', id: json.idea?.id }
      } else {
        // 'note' — send to capture inbox with type hint
        await api.post('/api/capture', { type: 'note', content: trimmed })
        return { route: 'note' }
      }
    },
    onSuccess: (result) => {
      flashSuccess()
      if (result.route === 'todo') {
        queryClient.invalidateQueries({ queryKey: queryKeys.todos })
      } else if (result.route === 'idea') {
        queryClient.invalidateQueries({ queryKey: queryKeys.ideas('pending') })
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.capture })
      }
    },
  })

  return {
    route,
    setRoute,
    captureMutation,
    successFlash,
    isPending: captureMutation.isPending,
    error: captureMutation.error,
  }
}
