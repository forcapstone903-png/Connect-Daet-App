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

    const link = `/forum/${data.id}`
    const contentType = 'forum'
    const recipients = await adminSupabase
      .from('info_users')
      .select('id')
      .eq('status', 'active')
      .neq('user_type', 'admin')

    if (!recipients.error && Array.isArray(recipients.data)) {
      const rows = []
      for (const recipient of recipients.data) {
        if (!recipient?.id) continue

        const { data: existing } = await adminSupabase
          .from('info_notifications')
          .select('id')
          .eq('user_id', recipient.id)
          .eq('link', link)
          .limit(1)

        if (existing && existing.length > 0) continue

        rows.push({
          user_id: recipient.id,
          title: 'New forum post from Administrator',
          message: title,
          type: contentType,
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          link,
          actor_id: session?.user_id || null,
        })
      }

      if (rows.length) {
        await adminSupabase.from('info_notifications').insert(rows)
      }
    }

    return NextResponse.json({ success: true, thread: data })
  } catch (error) {
    console.error('Forum create error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to create thread' }, { status: 500 })
  }
}
