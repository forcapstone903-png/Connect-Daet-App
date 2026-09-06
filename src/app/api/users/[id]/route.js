import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

export async function GET(request, { params }) {
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Profile service is not configured.' }, { status: 500 })
  }

  const resolvedParams = await params
  const profileId = resolvedParams?.id
  if (!profileId) {
    return NextResponse.json({ success: false, message: 'Profile id is required.' }, { status: 400 })
  }
  const viewerId = getServerSession(request)?.user_id || null

  try {
    const [{ data: userData, error: userError }, { data: profileData, error: profileError }, { data: followRow, error: followError }] = await Promise.all([
      adminSupabase
        .from('info_users')
        .select('id, full_name, profile_image_url, bio, city, country, points, level, user_type, status')
        .eq('id', profileId)
        .maybeSingle(),
      adminSupabase
        .from('profiles')
        .select('user_id, full_name, profile_image_url, cover_photo_url, bio, city, country, is_public')
        .eq('user_id', profileId)
        .maybeSingle(),
      viewerId && viewerId !== profileId
        ? adminSupabase
            .from('user_follows')
            .select('id')
            .eq('follower_id', viewerId)
            .eq('following_id', profileId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (userError) throw userError
    if (profileError) throw profileError
    if (followError) throw followError
    if (!userData || userData.status !== 'active') {
      return NextResponse.json({ success: false, message: 'This profile could not be found.' }, { status: 404 })
    }

    const isOwnProfile = viewerId === profileId
    const privacyLevel = profileData?.is_public === false ? 'private' : 'public'
    if (privacyLevel !== 'public' && !isOwnProfile && !followRow) {
      return NextResponse.json({ success: false, message: 'This profile is private.' }, { status: 403 })
    }

    const [{ data: userPosts }, { data: blogs }, { data: threads }, { data: events }] = await Promise.all([
      adminSupabase
        .from('info_user_posts')
        .select('id, user_id, title, content, created_at, updated_at')
        .eq('user_id', profileId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('info_blogs')
        .select('id, title, excerpt, created_at, published_at, category, slug')
        .eq('created_by', profileId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('forum_threads')
        .select('id, title, content, created_at, category_id')
        .eq('created_by', profileId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('info_events')
        .select('id, title, description, start_date, created_at, status')
        .eq('created_by', profileId)
        .eq('status', 'published')
        .order('start_date', { ascending: false })
        .limit(20),
    ])

    return NextResponse.json({
      success: true,
      viewer_id: viewerId,
      is_following: Boolean(followRow),
      profile: {
        ...userData,
        full_name: profileData?.full_name || userData.full_name,
        profile_image_url: userData.profile_image_url || profileData?.profile_image_url || null,
        cover_photo_url: profileData?.cover_photo_url || null,
        bio: profileData?.bio || userData.bio,
        city: profileData?.city || userData.city,
        country: profileData?.country || userData.country,
      },
      content: {
        user_posts: userPosts || [],
        blogs: blogs || [],
        threads: threads || [],
        events: events || [],
      },
    })
  } catch (error) {
    console.error('Public profile API failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to load this profile right now.' }, { status: 500 })
  }
}
