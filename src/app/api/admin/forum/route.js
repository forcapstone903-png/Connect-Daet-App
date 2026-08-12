import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for forum administration.' },
    { status: 500 }
  )
}

export async function GET(request) {
  if (!adminSupabase) return missingConfig()

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')

    let query = adminSupabase.from('forum_threads').select('id, title, content, created_by, created_at, updated_at, last_activity_at, reply_count, status').order('last_activity_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, threads: data || [] })
  } catch (error) {
    console.error('Forum list error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to fetch forum threads' }, { status: 500 })
  }
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()

  try {
    const body = await request.json()
    const title = (body.title || '').trim()
    const content = (body.content || '').trim()
    const created_by = body.created_by || null
    const status = body.status || 'published'

    if (!title || !content) {
      return NextResponse.json({ success: false, message: 'Title and content are required.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const item = {
      title,
      content,
      created_by,
      status,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      reply_count: 0,
    }

    const { data, error } = await adminSupabase
      .from('forum_threads')
      .insert([item])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, thread: data })
  } catch (error) {
    console.error('Forum create error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to create thread' }, { status: 500 })
  }
}
