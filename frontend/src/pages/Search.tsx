


import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, CheckSquare, Target, CalendarDays, Mail, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { API_BASE } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'

interface Todo {
  id: string
  text: string
  done: boolean
  created_at: string
}

interface Mission {
  id: string
  title: string
  status: string
  created_at: string
}

interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
}

interface Email {
  id: string
  from: string
  subject: string
  date: string
  preview: string
  read: boolean
  folder: string
}

interface Results {
  todos: Todo[]
  missions: Mission[]
  events: CalEvent[]
  emails: Email[]
}

function SectionHeader({ icon: Icon, label, count }: { icon: React.ElementType; label: string; count: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px',
      marginTop: '24px',
    }}>
      <Icon size={14} style={{ color: 'var(--accent)' }} />
      <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span style={{
        fontSize: '10px',
        background: 'rgba(155, 132, 236, 0.15)',
        color: 'var(--accent)',
        borderRadius: '10px',
        padding: '1px 7px',
        fontWeight: 600,
      }}>{count}</span>
    </div>
  )
}

function ResultCard({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link to={href} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '6px',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(155,132,236,0.08)'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(155,132,236,0.2)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)'
        }}
      >
        {children}
      </div>
    </Link>
  )
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data: results, isLoading: loading } = useQuery<Results>({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    enabled: !!debouncedQuery.trim(),
  })

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) {
      setDebouncedQuery('')
      return
    }
    timerRef.current = setTimeout(() => setDebouncedQuery(val), 300)
  }, [])

  const hasResults = results && (
    results.todos.length > 0 ||
    results.missions.length > 0 ||
    results.events.length > 0 ||
    results.emails.length > 0
  )

  const totalCount = results
    ? results.todos.length + results.missions.length + results.events.length + results.emails.length
    : 0

  return (
    <div style={{ padding: '32px', maxWidth: '720px', margin: '0 auto' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.9; }
        }
      `}</style>

      <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px' }}>
        Search
      </h1>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <Search size={16} style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          placeholder="Search todos, missions, calendar, email..."
          style={{
            width: '100%',
            padding: '12px 14px 12px 40px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'rgba(155,132,236,0.4)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        />
        {loading && (
          <Loader2 size={16} style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent)',
            animation: 'spin 1s linear infinite',
          }} />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>

      {/* Empty state */}
      {!query && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '64px', fontSize: '14px' }}>
          <Search size={32} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
          Search across your todos, missions, calendar, and email
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !results && <SkeletonList count={3} lines={2} />}

      {/* No results */}
      {!loading && results && !hasResults && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '64px', fontSize: '14px' }}>
          No results for &ldquo;{query}&rdquo;
        </div>
      )}

      {/* Results */}
      {results && hasResults && (
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            {totalCount} result{totalCount !== 1 ? 's' : ''}
          </div>

          {/* Todos */}
          {results.todos.length > 0 && (
            <div>
              <SectionHeader icon={CheckSquare} label="Todos" count={results.todos.length} />
              {results.todos.map(todo => (
                <ResultCard key={todo.id} href="/todos">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '1px 7px',
                      borderRadius: '4px',
                      background: todo.done ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)',
                      color: todo.done ? '#4ade80' : 'var(--text-muted)',
                      flexShrink: 0,
                    }}>
                      {todo.done ? 'done' : 'open'}
                    </span>
                    <span style={{
                      fontSize: '14px',
                      color: 'var(--text-primary)',
                      textDecoration: todo.done ? 'line-through' : 'none',
                      opacity: todo.done ? 0.6 : 1,
                    }}>
                      {todo.text}
                    </span>
                  </div>
                </ResultCard>
              ))}
            </div>
          )}

          {/* Missions */}
          {results.missions.length > 0 && (
            <div>
              <SectionHeader icon={Target} label="Missions" count={results.missions.length} />
              {results.missions.map(mission => (
                <ResultCard key={mission.id} href="/missions">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '1px 7px',
                      borderRadius: '4px',
                      background: 'rgba(155,132,236,0.12)',
                      color: 'var(--accent)',
                      flexShrink: 0,
                      textTransform: 'capitalize',
                    }}>
                      {mission.status}
                    </span>
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                      {mission.title}
                    </span>
                  </div>
                </ResultCard>
              ))}
            </div>
          )}

          {/* Calendar events */}
          {results.events.length > 0 && (
            <div>
              <SectionHeader icon={CalendarDays} label="Calendar" count={results.events.length} />
              {results.events.map(event => (
                <ResultCard key={event.id} href="/calendar">
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '2px' }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {event.calendar} &middot; {event.allDay ? new Date(event.start).toLocaleDateString() : new Date(event.start).toLocaleString()}
                    </div>
                  </div>
                </ResultCard>
              ))}
            </div>
          )}

          {/* Emails */}
          {results.emails.length > 0 && (
            <div>
              <SectionHeader icon={Mail} label="Email" count={results.emails.length} />
              {results.emails.map(email => (
                <ResultCard key={email.id} href="/email">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      {!email.read && (
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: 'var(--accent)', flexShrink: 0,
                        }} />
                      )}
                      <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: email.read ? 400 : 600 }}>
                        {email.subject}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {email.from} &middot; {new Date(email.date).toLocaleDateString()}
                    </div>
                    {email.preview && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {email.preview}
                      </div>
                    )}
                  </div>
                </ResultCard>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
