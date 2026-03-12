import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const tag = searchParams.get('tag')

  let query = supabaseAdmin
    .from('knowledge_entries')
    .select('*')
    .order('created_at', { ascending: false })

  if (q) {
    // Sanitize: strip commas and parens to prevent PostgREST filter injection
    const safe = q.replace(/[,()]/g, '')
    query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`)
  }
  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ entries: data })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { title, content, tags, source_url } = body

  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('knowledge_entries')
    .insert({
      title: title.trim(),
      content: content || null,
      tags: tags || [],
      source_url: source_url || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function PATCH(req: Request) {
  const { id, title, content, tags, source_url } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (title !== undefined) updateData.title = title
  if (content !== undefined) updateData.content = content
  if (tags !== undefined) updateData.tags = tags
  if (source_url !== undefined) updateData.source_url = source_url

  const { data, error } = await supabaseAdmin
    .from('knowledge_entries')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('knowledge_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
