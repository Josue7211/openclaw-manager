import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()

  if (!q) {
    return NextResponse.json({ todos: [], missions: [], events: [], emails: [], reminders: [], knowledge: [] })
  }

  const pattern = `%${q}%`

  // Todos + Missions from Supabase (parallel)
  const [todosResult, missionsResult] = await Promise.all([
    supabaseAdmin
      ? supabaseAdmin.from('todos').select('id, text, done, created_at').ilike('text', pattern).limit(20)
      : { data: [], error: null },
    supabaseAdmin
      ? supabaseAdmin.from('missions').select('id, title, status, created_at').ilike('title', pattern).limit(20)
      : { data: [], error: null },
  ])

  const todos = todosResult.data || []
  const missions = missionsResult.data || []

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const lq = q.toLowerCase()
  const hasCaldav = !!(process.env.CALDAV_USERNAME && process.env.CALDAV_PASSWORD)
  const hasEmail = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD)
  const apiKey = process.env.MC_API_KEY || ''
  const authHeaders: Record<string, string> = apiKey ? { 'X-API-Key': apiKey } : {}

  // Fetch all external sources in parallel
  const [calData, emailData, remData, knData] = await Promise.all([
    hasCaldav
      ? fetch(`${base}/api/calendar`, { cache: 'no-store', headers: authHeaders }).then(r => r.json()).catch(() => ({}))
      : Promise.resolve({}),
    hasEmail
      ? fetch(`${base}/api/email`, { cache: 'no-store', headers: authHeaders }).then(r => r.json()).catch(() => ({}))
      : Promise.resolve({}),
    hasCaldav
      ? fetch(`${base}/api/reminders`, { cache: 'no-store', headers: authHeaders }).then(r => r.json()).catch(() => ({}))
      : Promise.resolve({}),
    fetch(`${base}/api/knowledge?q=${encodeURIComponent(q)}`, { cache: 'no-store', headers: authHeaders }).then(r => r.json()).catch(() => ({})),
  ])

  // Filter calendar events
  const now = new Date()
  const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const futureDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
  const events = (calData.events || []).filter((e: { title: string; description?: string; start: string }) => {
    const eventDate = new Date(e.start)
    return eventDate >= pastDate && eventDate <= futureDate &&
      (e.title.toLowerCase().includes(lq) || (e.description && e.description.toLowerCase().includes(lq)))
  })

  // Filter emails
  const emails = (emailData.emails || []).filter((e: { subject: string; from: string; preview: string }) =>
    e.subject.toLowerCase().includes(lq) || e.from.toLowerCase().includes(lq) || e.preview.toLowerCase().includes(lq)
  )

  // Filter reminders
  const reminders = (remData.reminders || []).filter((r: { title: string }) =>
    r.title.toLowerCase().includes(lq)
  ).slice(0, 20)

  const knowledge = (knData.entries || []).slice(0, 20)

  return NextResponse.json({ todos, missions, events, emails, reminders, knowledge })
}
