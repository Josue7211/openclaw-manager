import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin.from('ideas').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ ideas: data })
}

export async function POST(req: Request) {
  const { title, description, why, effort, impact, category } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('ideas')
    .insert({ title: title.trim(), description, why, effort, impact, category, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ idea: data })
}

export async function PATCH(req: Request) {
  const { id, status, mission_id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Build update object with provided fields
  const updateData: any = {}
  if (status !== undefined) updateData.status = status
  if (mission_id !== undefined) updateData.mission_id = mission_id

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'At least one field (status or mission_id) must be provided' }, { status: 400 })
  }

  // If approving, auto-create mission
  if (status === 'approved') {
    // Get the idea first to access its title
    const { data: ideaData, error: getError } = await supabaseAdmin
      .from('ideas')
      .select('*')
      .eq('id', id)
      .single()

    if (getError) return NextResponse.json({ error: 'Database error' }, { status: 500 })

    // Auto-create mission via direct DB insert (avoids loopback HTTP + auth issues)
    try {
      const { data: mission } = await supabaseAdmin
        .from('missions')
        .insert({ title: ideaData.title, assignee: 'koda', status: 'pending' })
        .select('id')
        .single()

      if (mission?.id) {
        updateData.mission_id = mission.id
      }
    } catch (err) {
      console.error('[ideas] Failed to create mission:', err)
      // Continue anyway - don't fail the approval just because mission creation failed
    }
  }

  const { data, error } = await supabaseAdmin
    .from('ideas')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  return NextResponse.json({ idea: data })
}
