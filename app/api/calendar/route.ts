import { NextResponse } from 'next/server'

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendar: string
}

function parseVCalendar(icsText: string, calendarName: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const vevents = icsText.split('BEGIN:VEVENT').slice(1)

  for (const vevent of vevents) {
    try {
      const get = (key: string): string => {
        const regex = new RegExp(`^${key}[^:]*:(.*)$`, 'm')
        const match = vevent.match(regex)
        return match ? match[1].trim() : ''
      }

      const uid = get('UID')
      const summary = get('SUMMARY') || '(No title)'
      const dtstart = get('DTSTART')
      const dtend = get('DTEND') || get('DUE')

      if (!dtstart) continue

      const allDay = dtstart.length === 8 || dtstart.includes('VALUE=DATE')
      const cleanDate = (s: string) => s.replace(/.*:/, '')

      const parseDate = (raw: string): string => {
        const d = cleanDate(raw)
        if (d.length === 8) {
          // YYYYMMDD — all-day
          return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        }
        // YYYYMMDDTHHmmssZ
        const year = d.slice(0, 4)
        const month = d.slice(4, 6)
        const day = d.slice(6, 8)
        const hour = d.slice(9, 11)
        const min = d.slice(11, 13)
        const sec = d.slice(13, 15)
        const utc = d.endsWith('Z') ? 'Z' : ''
        return `${year}-${month}-${day}T${hour}:${min}:${sec}${utc}`
      }

      events.push({
        id: uid || Math.random().toString(36).slice(2),
        title: summary,
        start: parseDate(dtstart),
        end: dtend ? parseDate(dtend) : parseDate(dtstart),
        allDay,
        calendar: calendarName,
      })
    } catch {
      // skip malformed events
    }
  }

  return events
}

export async function GET() {
  const url = process.env.CALDAV_URL || 'https://caldav.icloud.com'
  const username = process.env.CALDAV_USERNAME || ''
  const password = process.env.CALDAV_PASSWORD || ''

  if (!username || !password) {
    return NextResponse.json({
      events: [],
      error: 'missing_credentials',
      message: 'CALDAV_USERNAME and CALDAV_PASSWORD are not set in .env.local',
    })
  }

  try {
    const { DAVClient } = await import('tsdav')
    const client = new DAVClient({
      serverUrl: url,
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    })

    await client.login()

    const calendars = await client.fetchCalendars()

    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const allEvents: CalendarEvent[] = []

    await Promise.all(
      calendars.map(async (cal) => {
        try {
          const objects = await client.fetchCalendarObjects({
            calendar: cal,
            timeRange: {
              start: now.toISOString(),
              end: in30.toISOString(),
            },
          })

          for (const obj of objects) {
            if (!obj.data) continue
            const calName = (cal.displayName as string) || 'Calendar'
            const rawData = obj.data as string
            const events = parseVCalendar(rawData, calName)
            allEvents.push(...events)
          }
        } catch {
          // skip calendars that error
        }
      })
    )

    // Sort by start date
    allEvents.sort((a, b) => a.start.localeCompare(b.start))

    return NextResponse.json({ events: allEvents })
  } catch (err) {
    console.error('[calendar] GET error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ events: [], error: 'fetch_failed' }, { status: 500 })
  }
}
