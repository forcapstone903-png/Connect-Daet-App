import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { notifyFollowers } from '@/lib/notificationAudience'
import { publicErrorMessage } from '@/lib/publicError'

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
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const status = searchParams.get('status')

    let query = adminSupabase
      .from('forum_threads')
      .select('id, title, content, created_by, category_id, forum_categories(id, name), pinned, created_at, updated_at, last_activity_at, reply_count, status')
      .order('pinned', { ascending: false })
      .order('last_activity_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      threads: (data || []).map((thread) => ({ ...thread, category: thread.forum_categories?.name || 'General' })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Forum list error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to fetch forum threads') }, { status: 500 })
  }
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  try {
    const actorId = session.user_id

    const body = await request.json()
    const title = (body.title || '').trim()
    const content = (body.content || '').trim()
    const created_by = actorId
    const status = body.status || 'published'
    const categoryName = String(body.category || 'General').trim()

    if (!title || title.length > 200 || !content || content.length > 50000) {
      return NextResponse.json({ success: false, message: 'A title up to 200 characters and content up to 50,000 characters are required.' }, { status: 400 })
    }
    if (!['draft', 'pending', 'published', 'closed', 'archived'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Choose a valid forum thread status.' }, { status: 400 })
    }

    const { data: category, error: categoryError } = await adminSupabase
      .from('forum_categories')
      .select('id')
      .eq('name', categoryName)
      .maybeSingle()
    if (categoryError) return NextResponse.json({ success: false, message: publicErrorMessage(categoryError) }, { status: 500 })
    if (!category) return NextResponse.json({ success: false, message: 'Choose an existing forum category.' }, { status: 400 })

    const now = new Date().toISOString()
    const item = {
      title,
      content,
      created_by,
      category_id: category.id,
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
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }

    await notifyFollowers(adminSupabase, {
      authorId: actorId,
      type: 'forum',
      link: `/info/user/forums/${data.id}`,
      postId: data.id,
      title: 'New forum discussion',
      actionText: 'started a new discussion',
      subject: title,
      status: data.status,
    })

    return NextResponse.json({ success: true, thread: data })
  } catch (error) {
    console.error('Forum create error:', error)
    return NextResponse.json({ success: false, message: publicErrorMessage(error, 'Unable to create thread') }, { status: 500 })
  }
}
