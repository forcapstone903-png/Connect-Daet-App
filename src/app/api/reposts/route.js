import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'amenity',
  'forum_thread',
  'announcement',
  'user_post',
])

function normalizeContentType(value) {
  const type = String(value || '').trim().toLowerCase()
  return type === 'forum' ? 'forum_thread' : type === 'post' ? 'user_post' : type
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id || null
  if (!userId) return NextResponse.json({ success: false, message: 'Please log in to repost.' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const contentType = normalizeContentType(body.contentType)
  const contentId = String(body.contentId || '').trim()
  const quoteText = String(body.quoteText || '').trim() || null

  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return NextResponse.json({ success: false, message: 'Invalid repost content.' }, { status: 400 })
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: existingRepost, error: existingRepostError } = await adminSupabase
    .from('reposts')
    .select('id')
    .eq('user_id', userId)
    .eq('original_content_type', contentType)
    .eq('original_content_id', contentId)
    .maybeSingle()

  if (existingRepostError) {
    return NextResponse.json({ success: false, message: existingRepostError.message || 'Unable to check repost.' }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from('reposts')
    .upsert({
      user_id: userId,
      original_content_type: contentType,
      original_content_id: contentId,
      quote_text: quoteText,
    }, { onConflict: 'user_id,original_content_type,original_content_id' })
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at')
    .single()

  if (error) {
    console.error('Repost insert failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to repost.' }, { status: 400 })
  }

  if (!existingRepost) {
    const { data: followers, error: followersError } = await adminSupabase
      .from('user_follows')
      .select('follower_id')
      .eq('following_id', userId)
      .neq('follower_id', userId)

    if (followersError) {
      console.error('Repost follower lookup failed:', followersError)
    } else {
      const followerIds = [...new Set((followers || []).map((follower) => follower.follower_id).filter(Boolean))]
      if (followerIds.length) {
        const { data: reposter } = await adminSupabase
          .from('info_users')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()
        const notificationRows = followerIds.map((followerId) => ({
          user_id: followerId,
          title: 'New repost',
          message: `${reposter?.full_name || 'Someone you follow'} reposted a post.`,
          type: 'repost',
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          link: `/user/posts/${contentId}`,
          post_id: contentId,
          actor_id: userId,
        }))
        const { error: notificationError } = await adminSupabase
          .from('info_notifications')
          .insert(notificationRows)
        if (notificationError) console.error('Repost follower notification failed:', notificationError)
      }
    }
  }

  return NextResponse.json({ success: true, repost: data })
}
