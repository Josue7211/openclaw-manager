import { useState } from 'react'
import { CheckSquare } from '@phosphor-icons/react'
import { SkeletonRows } from '@/components/Skeleton'
import { DemoBadge } from '@/components/DemoModeBanner'
import type { Todo } from '@/lib/types'

interface TodoSectionProps {
  todos: Todo[]
  mounted: boolean
  isDemo: boolean
  onAdd: (text: string) => Promise<void>
  onToggle: (id: string, done: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function TodoSection({ todos, mounted, isDemo, onAdd, onToggle, onDelete }: TodoSectionProps) {
  const [todoInput, setTodoInput] = useState('')

  const addTodo = async () => {
    if (!todoInput.trim()) return
    await onAdd(todoInput)
    setTodoInput('')
  }

  return (
    <div className="card" style={{ padding: '20px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <CheckSquare size={14} style={{ color: 'var(--green)' }} />
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>To-Do</span>
        {isDemo && <DemoBadge />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
        {!mounted ? (
          <SkeletonRows count={3} />
        ) : todos.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No todos yet</div>
        ) : todos.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px',
            background: 'var(--bg-white-03)', borderRadius: '10px',
            border: `1px solid ${t.done ? 'var(--emerald-a20)' : 'var(--border)'}`,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer', minWidth: 0 }}>
              <input
                type="checkbox" checked={t.done} onChange={() => onToggle(t.id, t.done)}
                style={{ cursor: 'pointer', accentColor: 'var(--green)', flexShrink: 0 }}
              />
              <span style={{
                flex: 1, fontSize: '12px',
                color: t.done ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: t.done ? 'line-through' : 'none',
              }}>{t.text}</span>
            </label>
            <button onClick={() => onDelete(t.id)} className="btn-delete" aria-label="Delete todo">&#x2715;</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={todoInput}
          onChange={e => setTodoInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()}
          placeholder="Add a task..."
          aria-label="Add task"
          style={{ flex: 1, minWidth: 0, background: 'var(--bg-white-03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '6px 10px', fontSize: '12px', color: 'var(--text-primary)', outline: 'none' }}
        />
        <button onClick={addTodo} style={{ background: 'var(--green)', border: 'none', borderRadius: '10px', color: 'var(--text-on-accent)', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
      </div>
    </div>
  )
}
