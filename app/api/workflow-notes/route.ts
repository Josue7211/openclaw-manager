import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  let query = supabaseAdmin.from('workflow_notes').select('*').order('created_at', { ascending: false })
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ notes: data })
}

export async function POST(req: Request) {
  const { category, note } = await req.json()
  if (!category || !note) return NextResponse.json({ error: 'category and note required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('workflow_notes')
    .insert({ category, note })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ note: data })
}

export async function PATCH(req: Request) {
  const { id, applied } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('workflow_notes')
    .update({ applied })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ note: data })
}
