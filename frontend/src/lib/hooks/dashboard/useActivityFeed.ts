import { useMemo } from 'react'
import { useMissions } from './useMissions'
import { useIdeas } from './useIdeas'
import { useMemoryEntries } from './useMemoryEntries'
import { useTodosWidget } from './useTodosWidget'

export interface ActivityItem {
  id: string
  type: 'mission' | 'idea' | 'todo' | 'memory'
  icon: string
  title: string
  description?: string
  timestamp: string
  color: string
}

export function useActivityFeed(maxItems = 15) {
  const { missions } = useMissions()
  const { pendingIdeas } = useIdeas()
  const { memory } = useMemoryEntries()
  const { todos, mounted } = useTodosWidget()

  const feed = useMemo(() => {
    const items: ActivityItem[] = []

    // Missions — active/pending missions as activity
    for (const m of missions) {
      items.push({
        id: `mission-${m.id}`,
        type: 'mission',
        icon: 'Target',
        title: m.title,
        description: `Mission ${m.status}`,
        timestamp: m.updated_at || m.created_at || new Date().toISOString(),
        color: 'var(--accent)',
      })
    }

    // Ideas — pending ideas as activity
    for (const idea of pendingIdeas) {
      items.push({
        id: `idea-${idea.id}`,
        type: 'idea',
        icon: 'Lightbulb',
        title: idea.title,
        description: `Idea ${idea.status}`,
        timestamp: idea.created_at || new Date().toISOString(),
        color: 'var(--gold)',
      })
    }

    // Completed todos are interesting activity
    for (const todo of todos.filter(t => t.done).slice(0, 5)) {
      items.push({
        id: `todo-${todo.id}`,
        type: 'todo',
        icon: 'CheckCircle',
        title: todo.text,
        description: 'Completed',
        timestamp: todo.created_at || new Date().toISOString(),
        color: 'var(--green-500)',
      })
    }

    // Memory entries — MemD updates
    for (const entry of memory.slice(0, 5)) {
      items.push({
        id: `memory-${entry.path}`,
        type: 'memory',
        icon: 'Brain',
        title: entry.path.split('/').pop() || entry.path,
        description: 'MemD entry updated',
        timestamp: entry.date || new Date().toISOString(),
        color: 'var(--purple)',
      })
    }

    // Sort by timestamp descending, take maxItems
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return items.slice(0, maxItems)
  }, [missions, pendingIdeas, todos, memory, maxItems])

  return { feed, mounted }
}
