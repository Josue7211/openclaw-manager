import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { isDemoMode, DEMO_CALENDAR_EVENTS } from '@/lib/demo-data'
import type { CalendarEvent } from '@/lib/types'

export function useCalendarWidget() {
  const _demo = isDemoMode()

  const { data, isSuccess } = useQuery<{ events?: CalendarEvent[] }>({
    queryKey: queryKeys.calendar,
    queryFn: () => api.get<{ events?: CalendarEvent[] }>('/api/calendar'),
    enabled: !_demo,
  })

  const allEvents = _demo ? DEMO_CALENDAR_EVENTS : (data?.events ?? [])

  const todayStr = new Date().toISOString().slice(0, 10)

  const todayEvents = useMemo(
    () =>
      allEvents
        .filter((e: CalendarEvent) => e.start.slice(0, 10) === todayStr)
        .sort((a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start)),
    [allEvents, todayStr],
  )

  const upcomingEvents = useMemo(() => {
    const now = new Date().toISOString()
    return allEvents
      .filter((e: CalendarEvent) => e.start >= now)
      .sort((a: CalendarEvent, b: CalendarEvent) => a.start.localeCompare(b.start))
      .slice(0, 5)
  }, [allEvents])

  return {
    events: allEvents,
    todayEvents,
    upcomingEvents,
    mounted: _demo || isSuccess,
  }
}
