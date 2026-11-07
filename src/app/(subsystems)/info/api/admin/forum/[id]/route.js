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

export async function GET(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const threadId = params.id

  try {
    const { data, error } = await adminSupabase
      .from('forum_threads')
      .select('id, title, content, created_by, created_at, updated_at, last_activity_at, reply_count, status')
      .eq('id', threadId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, thread: data })
  } catch (error) {
    console.error('Forum thread detail error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load thread details' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const threadId = params.id

  try {
    const body = await request.json()
    const title = (body.title || '').trim()
    const content = (body.content || '').trim()
    const status = body.status || 'published'

    if (!title || !content) {
      return NextResponse.json({ success: false, message: 'Title and content are required.' }, { status: 400 })
    }

    const { data, error } = await adminSupabase
      .from('forum_threads')
      .update({ title, content, status, updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq('id', threadId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, thread: data })
  } catch (error) {
    console.error('Forum thread update error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to update thread' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const threadId = params.id

  try {
    const { error } = await adminSupabase
      .from('forum_threads')
      .delete()
      .eq('id', threadId)

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Thread deleted successfully' })
  } catch (error) {
    console.error('Forum thread delete error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to delete thread' }, { status: 500 })
  }
}
