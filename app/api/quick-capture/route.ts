import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

type CaptureType = 'Note' | 'Task' | 'Idea' | 'Decision'

export async function POST(req: Request) {
  // --- API key check ---
  const requiredKey = process.env.CAPTURE_API_KEY
  if (requiredKey) {
    const provided = req.headers.get('x-capture-key')
    if (provided !== requiredKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // --- Parse body ---
  let body: { content?: string; type?: CaptureType; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { content, type, source } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const validTypes: CaptureType[] = ['Note', 'Task', 'Idea', 'Decision']
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(', ')}` },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  // --- Route to the correct table ---
  if (type === 'Task') {
    const { data, error } = await supabaseAdmin
      .from('todos')
      .insert({ title: content.trim(), completed: false, created_at: now })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json({ ok: true, id: String(data.id) })
  }

  if (type === 'Idea') {
    const { data, error } = await supabaseAdmin
      .from('ideas')
      .insert({ title: content.trim(), status: 'pending', created_at: now })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
    return NextResponse.json({ ok: true, id: String(data.id) })
  }

  // type === 'Note' | 'Decision'
  // Try `captures` table first; fall back to `todos`
  const capturesInsert = await supabaseAdmin
    .from('captures')
    .insert({ title: content.trim(), type, source: source ?? 'ios-shortcut', created_at: now })
    .select('id')
    .single()

  if (!capturesInsert.error) {
    return NextResponse.json({ ok: true, id: String(capturesInsert.data.id) })
  }

  // captures table doesn't exist (or another error) — fall back to todos
  const { data, error } = await supabaseAdmin
    .from('todos')
    .insert({ title: `[${type}] ${content.trim()}`, completed: false, created_at: now })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true, id: String(data.id) })
}
