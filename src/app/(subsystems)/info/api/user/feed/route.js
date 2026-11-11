import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function errorResponse(message, status = 500) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

function canViewContentVisibility(visibility, ownerId, viewerId, followedIds, isAdmin) {
  if (ownerId === viewerId || isAdmin) return true
  if (visibility === 'private') return false
  if (visibility === 'followers') return followedIds.has(ownerId)
  return true
}

function canViewAccount(profile, accountId, viewerId, followedIds, isAdmin) {
  if (!accountId || accountId === viewerId || isAdmin) return true
  const privacyLevel = profile?.is_public === false
    ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
    : profile?.privacy_level || 'public'
  return privacyLevel === 'public' || followedIds.has(accountId)
}

export async function GET(request) {
  if (!adminSupabase) return errorResponse('Feed service is not configured.')

  const session = getServerSession(request)
  const viewerId = session?.user_id || null
  if (!viewerId) return errorResponse('Please log in to view the feed.', 401)
  const isAdmin = ['admin', 'administrator'].includes(String(session.role || '').toLowerCase())

  try {
    const [
      { data: posts, error: postsError },
      { data: reposts, error: repostsError },
      { data: followRows, error: followsError },
    ] = await Promise.all([
      adminSupabase
        .from('info_user_posts')
        .select('id, user_id, title, content, created_at, updated_at, status, visibility')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50),
      adminSupabase
        .from('reposts')
        .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
        .in('original_content_type', ['user_post', 'blog', 'event', 'tourist_spot'])
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50),
      adminSupabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', viewerId),
    ])
    if (postsError) throw postsError
    if (repostsError) throw repostsError
    if (followsError) throw followsError

    const followedIds = new Set([viewerId, ...(followRows || []).map((row) => row.following_id).filter(Boolean)])
    const repostIdsByType = (type) => [...new Set(
      (reposts || [])
        .filter((repost) => repost.original_content_type === type)
        .map((repost) => repost.original_content_id)
        .filter(Boolean)
    )]
    const postIds = repostIdsByType('user_post')
    const blogIds = repostIdsByType('blog')
    const eventIds = repostIdsByType('event')
    const touristSpotIds = repostIdsByType('tourist_spot')

    const [
      { data: repostedPosts, error: repostedPostsError },
      { data: repostedBlogs, error: repostedBlogsError },
      { data: repostedEvents, error: repostedEventsError },
      { data: repostedTouristSpots, error: repostedTouristSpotsError },
    ] = await Promise.all([
      postIds.length
        ? adminSupabase
          .from('info_user_posts')
          .select('id, user_id, title, content, created_at, updated_at, status, visibility')
          .in('id', postIds)
          .eq('status', 'published')
        : Promise.resolve({ data: [], error: null }),
      blogIds.length
        ? adminSupabase
          .from('info_blogs')
          .select('id, created_by, title, excerpt, content, category, featured_image, images, videos, media_layout, published_at, created_at, status')
          .in('id', blogIds)
          .eq('status', 'published')
          .eq('approval_status', 'approved')
          .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
        : Promise.resolve({ data: [], error: null }),
      eventIds.length
        ? adminSupabase
          .from('info_events')
          .select('id, created_by, title, description, featured_image, images, start_date, start_time, category, location, venue, created_at, status')
          .in('id', eventIds)
          .in('status', ['published', 'cancelled', 'completed'])
          .eq('approval_status', 'approved')
        : Promise.resolve({ data: [], error: null }),
      touristSpotIds.length
        ? adminSupabase
          .from('info_tourist_spots')
          .select('id, created_by, name, description, category, location, rating, entry_fee, opening_hours, best_visit_time, featured, featured_image, images, videos, created_at, status')
          .in('id', touristSpotIds)
          .eq('status', 'active')
        : Promise.resolve({ data: [], error: null }),
    ])
    if (repostedPostsError) throw repostedPostsError
    if (repostedBlogsError) throw repostedBlogsError
    if (repostedEventsError) throw repostedEventsError
    if (repostedTouristSpotsError) throw repostedTouristSpotsError

    const postsById = new Map((repostedPosts || []).map((post) => [post.id, post]))
    const blogsById = new Map((repostedBlogs || []).map((blog) => [blog.id, blog]))
    const eventsById = new Map((repostedEvents || []).map((event) => [event.id, event]))
    const touristSpotsById = new Map((repostedTouristSpots || []).map((spot) => [spot.id, {
      ...spot,
      title: spot.name,
      content: spot.description,
      excerpt: spot.description,
    }]))
    const originalForRepost = (repost) => {
      if (repost.original_content_type === 'user_post') return postsById.get(repost.original_content_id)
      if (repost.original_content_type === 'blog') return blogsById.get(repost.original_content_id)
      if (repost.original_content_type === 'event') return eventsById.get(repost.original_content_id)
      if (repost.original_content_type === 'tourist_spot') return touristSpotsById.get(repost.original_content_id)
      return null
    }

    const accountIds = [...new Set([
      ...(posts || []).map((post) => post.user_id),
      ...(reposts || []).map((repost) => repost.user_id),
      ...(repostedPosts || []).map((post) => post.user_id),
      ...(repostedBlogs || []).map((blog) => blog.created_by),
      ...(repostedEvents || []).map((event) => event.created_by),
      ...(repostedTouristSpots || []).map((spot) => spot.created_by),
    ].filter(Boolean))]
    const { data: profiles, error: profilesError } = accountIds.length
      ? await adminSupabase
        .from('profiles')
        .select('user_id, privacy_level, is_public')
        .in('user_id', accountIds)
      : { data: [], error: null }
    if (profilesError) throw profilesError
    const profilesByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]))

    const visiblePosts = (posts || []).filter((post) => (
      canViewContentVisibility(post.visibility, post.user_id, viewerId, followedIds, isAdmin)
      && canViewAccount(profilesByUserId.get(post.user_id), post.user_id, viewerId, followedIds, isAdmin)
    ))
    const visibleReposts = (reposts || []).flatMap((repost) => {
      const originalPost = originalForRepost(repost)
      if (!originalPost) return []

      const originalOwnerId = originalPost.user_id || originalPost.created_by
      const canViewRepost = canViewContentVisibility(repost.visibility, repost.user_id, viewerId, followedIds, isAdmin)
        && canViewAccount(profilesByUserId.get(repost.user_id), repost.user_id, viewerId, followedIds, isAdmin)
      const canViewOriginal = canViewContentVisibility(originalPost.visibility, originalOwnerId, viewerId, followedIds, isAdmin)
        && canViewAccount(profilesByUserId.get(originalOwnerId), originalOwnerId, viewerId, followedIds, isAdmin)
      if (!canViewRepost || !canViewOriginal) return []

      return [{
        ...repost,
        original_author_id: originalOwnerId,
        original_post: originalPost,
      }]
    })

    return NextResponse.json({
      success: true,
      posts: visiblePosts,
      reposts: visibleReposts,
    }, {
      headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Personalized feed content lookup failed:', error)
    if (
      ['42703', 'PGRST204'].includes(error?.code)
      && /approval_status/i.test(`${error?.message || ''} ${error?.details || ''}`)
    ) {
      return errorResponse(
        'The blog moderation database update is not available yet. Apply migration 080_blog_admin_approval.sql, then retry.',
        503
      )
    }
    return errorResponse('Unable to load feed content right now.')
  }
}
