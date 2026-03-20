import { CheckSquare, Sun, SunHorizon, Moon, CalendarDots, CalendarBlank, Target, CheckCircle } from '@phosphor-icons/react'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/Skeleton'
import { todayISO } from '@/lib/utils'
import type { Todo, Mission, CalendarEvent } from '@/lib/types'
import { MOTIVATIONS } from './types'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', Icon: Sun }
  if (h < 18) return { text: 'Good afternoon', Icon: SunHorizon }
  return { text: 'Good evening', Icon: Moon }
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

interface MorningBriefProps {
  todos: Todo[]
  missions: Mission[]
  calendarEvents: CalendarEvent[]
  mounted: boolean
}

export default function MorningBrief({ todos, missions, calendarEvents, mounted }: MorningBriefProps) {
  const now = new Date()
  const { text: greetText, Icon: GreetIcon } = getGreeting()
  const motivation = MOTIVATIONS[now.getDay() % MOTIVATIONS.length]
  const today = todayISO()

  const focusTodos = todos
    .filter(t => !t.done)
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return 0
    })
    .slice(0, 3)

  const todayEvents = calendarEvents.filter(e => {
    const eDate = e.start.slice(0, 10)
    return eDate === today
  })

  const activeMissions = missions.filter(m => m.status === 'active' || m.status === 'pending').slice(0, 3)
  const activeMissionsCount = missions.filter(m => m.status === 'active' || m.status === 'pending').length

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--bg-panel)', border: '1px solid var(--purple-a10)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <GreetIcon size={18} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {greetText}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {formatDate(now)}
          </p>
        </div>
        <div style={{ maxWidth: '320px', textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.5 }}>
            &ldquo;{motivation}&rdquo;
          </p>
        </div>
      </div>

      {/* Three columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>

        {/* Today's Focus */}
        <div style={{ background: 'var(--bg-white-03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <CheckSquare size={12} style={{ color: 'var(--secondary)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Today&apos;s Focus</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : focusTodos.length === 0 ? (
            <div style={{ padding: '4px 0' }}><EmptyState icon={CheckCircle} title="All clear" description="Nothing pending." /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {focusTodos.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--secondary)', marginTop: '5px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* On the Calendar */}
        <div style={{ background: 'var(--bg-white-03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <CalendarDots size={12} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>On the Calendar</span>
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : todayEvents.length === 0 ? (
            <div style={{ padding: '4px 0' }}><EmptyState icon={CalendarBlank} title="No events today" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {todayEvents.slice(0, 3).map(e => {
                const time = e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontFamily: 'monospace', marginTop: '2px', flexShrink: 0 }}>{time}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.title}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Active Missions */}
        <div style={{ background: 'var(--bg-white-03)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Target size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Active Missions</span>
            {mounted && activeMissionsCount > 0 && (
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>{activeMissionsCount}</span>
            )}
          </div>
          {!mounted ? (
            <SkeletonRows count={2} />
          ) : activeMissions.length === 0 ? (
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>No active missions</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeMissions.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', marginTop: '5px', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{m.title}</span>
                </div>
              ))}
              {activeMissionsCount > 3 && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>+{activeMissionsCount - 3} more</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
