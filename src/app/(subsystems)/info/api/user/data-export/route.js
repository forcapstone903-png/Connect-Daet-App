import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function response(body, status = 200, headers = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      ...headers,
    },
  })
}

async function loadRows(adminSupabase, table, columns, userId, ownerColumn) {
  const rows = []
  const batchSize = 1000
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await adminSupabase
      .from(table)
      .select(columns)
      .eq(ownerColumn, userId)
      .range(offset, offset + batchSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < batchSize) return rows
  }
}

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return response({ success: false, message: 'Please sign in to download your data.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return response({ success: false, message: 'Personal data export is not configured.' }, 503)
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const userId = session.user_id
    const [
      accountResult,
      profileResult,
      posts,
      blogs,
      comments,
      blogComments,
      forumReplies,
      followsOut,
      followsIn,
      favorites,
      notifications,
      activity,
    ] = await Promise.all([
      adminSupabase
        .from('info_users')
        .select('id, email, full_name, username, phone_number, email_verified, user_type, profile_image_url, bio, address, city, country, points, created_at, last_login')
        .eq('id', userId)
        .maybeSingle(),
      adminSupabase
        .from('profiles')
        .select('full_name, profile_image_url, cover_photo_url, bio, city, country, address, location, is_public, privacy_level, language_preference, notification_preferences, privacy_preferences, ui_preferences, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      loadRows(adminSupabase, 'info_user_posts', 'id, title, content, status, created_at, updated_at', userId, 'user_id'),
      loadRows(adminSupabase, 'info_blogs', 'id, title, slug, content, excerpt, category, tags, status, published_at, created_at, updated_at', userId, 'created_by'),
      loadRows(adminSupabase, 'content_comments', 'id, content_type, content_id, parent_id, body, gif_url, sticker_url, status, created_at, updated_at', userId, 'user_id'),
      loadRows(adminSupabase, 'info_comments', 'id, blog_id, content, status, created_at, updated_at', userId, 'user_id'),
      loadRows(adminSupabase, 'forum_replies', 'id, thread_id, content, status, created_at, updated_at', userId, 'user_id'),
      adminSupabase.from('user_follows').select('following_id, created_at').eq('follower_id', userId),
      adminSupabase.from('user_follows').select('follower_id, created_at').eq('following_id', userId),
      loadRows(adminSupabase, 'user_favorites', 'id, item_type, item_id, created_at', userId, 'user_id'),
      loadRows(adminSupabase, 'info_notifications', 'id, title, message, type, is_read, created_at', userId, 'user_id'),
      loadRows(adminSupabase, 'user_activity_log', 'id, activity_type, entity_type, entity_id, description, metadata, created_at', userId, 'user_id'),
    ])

    if (accountResult.error) throw accountResult.error
    if (profileResult.error) throw profileResult.error
    if (followsOut.error) throw followsOut.error
    if (followsIn.error) throw followsIn.error
    if (!accountResult.data) return response({ success: false, message: 'Account data could not be found.' }, 404)

    const date = new Date().toISOString().slice(0, 10)
    return response({
      success: true,
      exportedAt: new Date().toISOString(),
      account: accountResult.data,
      profileSettings: profileResult.data,
      content: {
        posts,
        blogs,
        comments,
        blogComments,
        forumReplies,
      },
      community: {
        following: followsOut.data || [],
        followers: followsIn.data || [],
        favorites,
        notifications,
        activity,
      },
    }, 200, {
      'Content-Disposition': `attachment; filename="daet-connect-data-${date}.json"`,
    })
  } catch (error) {
    console.error('Personal data export failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to prepare your data export. Please try again.' }, 500)
  }
}
