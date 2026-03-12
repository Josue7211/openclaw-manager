import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [todosRes, ideasRes, missionsRes] = await Promise.all([
    supabaseAdmin
      .from('todos')
      .select('*')
      .eq('done', false)
      .lt('created_at', fourteenDaysAgo)
      .order('created_at'),
    supabaseAdmin
      .from('ideas')
      .select('*')
      .eq('status', 'approved')
      .is('mission_id', null)
      .lt('updated_at', sevenDaysAgo)
      .order('updated_at'),
    supabaseAdmin
      .from('missions')
      .select('*')
      .in('status', ['active', 'pending'])
      .lt('updated_at', sevenDaysAgo)
      .order('updated_at'),
  ])

  return NextResponse.json({
    todos: todosRes.data || [],
    ideas: ideasRes.data || [],
    missions: missionsRes.data || [],
  })
}
