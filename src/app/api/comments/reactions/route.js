import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const session = getServerSession(request)
    if (!session?.user_id) {
      return NextResponse.json({ success: false, message: 'Please sign in to react to comments.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const commentId = String(body.commentId || '').trim()
    if (!commentId) {
      return NextResponse.json({ success: false, message: 'Missing comment id.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Reaction service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: commentRow, error: commentLookupError } = await adminSupabase
      .from('content_comments')
      .select('user_id, content_type, content_id')
      .eq('id', commentId)
      .maybeSingle()

    if (commentLookupError) {
      console.error('Comment owner lookup failed:', commentLookupError)
    }

    const { error } = await adminSupabase
      .from('content_reactions')
      .upsert(
        { user_id: session.user_id, content_type: 'comment', content_id: commentId, reaction_type: 'like' },
        { onConflict: 'user_id,content_type,content_id' }
      )

    if (error) {
      console.error('Comment reaction insert error:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        raw: error,
      })
      return NextResponse.json({ success: false, message: error.message || 'Unable to react to comment.' }, { status: 400 })
    }

    if (commentRow?.user_id && commentRow.user_id !== session.user_id) {
      const ownerLink = commentRow.content_type && commentRow.content_id
        ? routeForEntity(commentRow.content_type, commentRow.content_id)
        : '/user/notifications'

      const { data: existing } = await adminSupabase
        .from('info_notifications')
        .select('id')
        .eq('user_id', commentRow.user_id)
        .eq('link', ownerLink)
        .limit(1)

      if (!existing || existing.length === 0) {
        await adminSupabase.from('info_notifications').insert({
          user_id: commentRow.user_id,
          title: 'New reaction',
          message: `${session.user_id ? 'Someone' : 'A user'} reacted to your comment`,
          type: 'reaction',
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          link: ownerLink,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Comment reaction route error:', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      raw: error,
    })
    return NextResponse.json({ success: false, message: error?.message || 'Unable to react to comment.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const session = getServerSession(request)
    if (!session?.user_id) {
      return NextResponse.json({ success: false, message: 'Please sign in to react to comments.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const commentId = String(body.commentId || '').trim()
    if (!commentId) {
      return NextResponse.json({ success: false, message: 'Missing comment id.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Reaction service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { error } = await adminSupabase
      .from('content_reactions')
      .delete()
      .eq('user_id', session.user_id)
      .eq('content_type', 'comment')
      .eq('content_id', commentId)
      .eq('reaction_type', 'like')

    if (error) {
      console.error('Comment reaction delete error:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        raw: error,
      })
      return NextResponse.json({ success: false, message: error.message || 'Unable to remove comment reaction.' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Comment reaction route error:', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      raw: error,
    })
    return NextResponse.json({ success: false, message: error?.message || 'Unable to remove comment reaction.' }, { status: 500 })
  }
}
