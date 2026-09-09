import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'amenity',
  'forum_thread',
  'forum_reply',
  'comment',
  'announcement',
  'user_post',
  'rating',
  'poll',
])

const ALLOWED_REACTION_TYPES = new Set(['like', 'love', 'laugh', 'wow', 'sad', 'angry'])

async function writeReaction(request, method) {
  try {
    const session = getServerSession(request)
    const userId = session?.user_id
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Please sign in to react to this content.' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const contentType = String(body.contentType || '').trim()
    const contentId = String(body.contentId || '').trim()
    const reactionType = String(body.reactionType || '').trim()

    if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId || !ALLOWED_REACTION_TYPES.has(reactionType)) {
      return NextResponse.json({ success: false, message: 'Invalid reaction payload.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: 'Reaction service is not configured.' }, { status: 500 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    if (method === 'DELETE') {
      const { error } = await adminSupabase
        .from('content_reactions')
        .delete()
        .eq('user_id', userId)
        .eq('content_type', contentType)
        .eq('content_id', contentId)

      if (error) {
        console.error('Reaction delete failed:', error)
        return NextResponse.json({ success: false, message: error.message || 'Unable to remove reaction.' }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    const { error } = await adminSupabase
      .from('content_reactions')
      .upsert(
        {
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          reaction_type: reactionType,
        },
        { onConflict: 'user_id,content_type,content_id' }
      )

    if (error) {
      console.error('Reaction upsert failed:', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      })
      return NextResponse.json({ success: false, message: error.message || 'Unable to react to content.' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reaction route error:', error)
    return NextResponse.json({ success: false, message: error?.message || 'Unable to react to content.' }, { status: 500 })
  }
}

export async function POST(request) {
  return writeReaction(request, 'POST')
}

export async function DELETE(request) {
  return writeReaction(request, 'DELETE')
}
