


import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { MagnifyingGlass, CheckSquare, Target, CalendarDots, Envelope, SpinnerGap } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SkeletonList } from '@/components/Skeleton'
import type { Todo, Mission, CalendarEvent, EmailMessage } from '@/lib/types'

interface Results {
  todos: Todo[]
  missions: Mission[]
  events: CalendarEvent[]
  emails: EmailMessage[]
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
        background: 'var(--purple-a15)',
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
        background: 'var(--bg-white-03)',
        border: '1px solid var(--active-bg)',
        marginBottom: '6px',
        transition: 'background 0.15s, border-color 0.15s',
        cursor: 'pointer',
      }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--purple-a08)'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--purple-a20)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-white-03)'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--active-bg)'
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
    queryFn: () => api.get<Results>(`/api/search?q=${encodeURIComponent(debouncedQuery)}`),
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

      <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '24px' }}>
        MagnifyingGlass
      </h1>

      {/* MagnifyingGlass bar */}
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <MagnifyingGlass size={16} style={{
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
          placeholder="MagnifyingGlass todos, missions, calendar, email..."
          aria-label="MagnifyingGlass"
          style={{
            width: '100%',
            padding: '12px 14px 12px 40px',
            background: 'var(--hover-bg)',
            border: '1px solid var(--border-hover)',
            borderRadius: '10px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = 'var(--purple-a40)'
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'var(--border-hover)'
          }}
        />
        {loading && (
          <SpinnerGap size={16} style={{
            position: 'absolute',
            right: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--accent)',
            animation: 'spin 1s linear infinite',
          }} />
        )}
      </div>



      <div aria-live="polite" aria-busy={loading}>
      {/* Empty state */}
      {!query && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '64px', fontSize: '14px' }}>
          <MagnifyingGlass size={32} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} />
          MagnifyingGlass across your todos, missions, calendar, and email
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !results && <SkeletonList count={3} lines={2} />}

      {/* No results */}
      {!loading && results && !hasResults && (
        <EmptyState icon={MagnifyingGlass} title={`No results for "${query}"`} description="Try a different search term." />
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
                      background: todo.done ? 'var(--secondary-a12)' : 'var(--active-bg)',
                      color: todo.done ? 'var(--secondary)' : 'var(--text-muted)',
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
                      background: 'var(--purple-a12)',
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
              <SectionHeader icon={CalendarDots} label="Calendar" count={results.events.length} />
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
              <SectionHeader icon={Envelope} label="Email" count={results.emails.length} />
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
    </div>
  )
}
