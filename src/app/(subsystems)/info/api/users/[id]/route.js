import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { filterValidUuidValues } from '@/lib/uuid'

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
  const archivedOnly = new URL(request.url).searchParams.get('archived') === 'true'

  try {
    const [{ data: userData, error: userError }, { data: profileData, error: profileError }, { data: followRow, error: followError }, { data: reverseFollowRow, error: reverseFollowError }] = await Promise.all([
      adminSupabase
        .from('info_users')
        .select('id, full_name, profile_image_url, bio, city, country, points, level, user_type, status, created_at')
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
      viewerId && viewerId !== profileId
        ? adminSupabase
            .from('user_follows')
            .select('id')
            .eq('follower_id', profileId)
            .eq('following_id', viewerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (userError) throw userError
    if (profileError) throw profileError
    if (followError) throw followError
    if (reverseFollowError) throw reverseFollowError
    if (!userData || userData.status !== 'active') {
      return NextResponse.json({ success: false, message: 'This profile could not be found.' }, { status: 404 })
    }

    const isOwnProfile = viewerId === profileId
    const privacyLevel = profileData?.is_public === false ? 'private' : 'public'
    if (privacyLevel !== 'public' && !isOwnProfile && !followRow) {
      return NextResponse.json({ success: false, message: 'This profile is private.' }, { status: 403 })
    }

    const [{ data: userPosts }, { data: blogs }, { data: threads }, { data: events }, { data: reposts }, { data: followRows }, { count: followersCount, error: followersCountError }, { count: followingCount, error: followingCountError }, { data: blockedRows, error: blockedError }] = await Promise.all([
      (async () => {
        const query = adminSupabase
          .from('info_user_posts')
          .select('id, user_id, title, content, created_at, updated_at, visibility')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (archivedOnly && viewerId === profileId) {
          const { data, error } = await query.in('status', ['archived'])
          if (!error) return { data: data || [], error: null }
          if (String(error.message || '').toLowerCase().includes('info_user_posts') && String(error.message || '').toLowerCase().includes('status')) {
            const { data: legacyData, error: legacyError } = await adminSupabase
              .from('info_user_posts')
              .select('id, user_id, title, content, created_at, updated_at, visibility')
              .eq('user_id', profileId)
              .order('created_at', { ascending: false })
              .limit(20)
            return { data: legacyData || [], error: legacyError }
          }
          return { data: [], error }
        }

        const { data, error } = await query.in('status', ['active', 'published'])
        if (!error) return { data: data || [], error: null }
        if (String(error.message || '').toLowerCase().includes('info_user_posts') && String(error.message || '').toLowerCase().includes('status')) {
          const { data: legacyData, error: legacyError } = await adminSupabase
            .from('info_user_posts')
            .select('id, user_id, title, content, created_at, updated_at, visibility')
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(20)
          return { data: legacyData || [], error: legacyError }
        }
        return { data: [], error }
      })(),
      adminSupabase
        .from('info_blogs')
        .select('id, title, excerpt, content, featured_image, images, videos, created_at, published_at, category, slug')
        .eq('created_by', profileId)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('forum_threads')
        .select('id, title, content, created_at, category_id')
        .eq('created_by', profileId)
        .in('status', ['active', 'published'])
        .order('created_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('info_events')
        .select('id, title, description, featured_image, images, start_date, created_at, status')
        .eq('created_by', profileId)
        .eq('status', 'published')
        .order('start_date', { ascending: false })
        .limit(20),
      adminSupabase
        .from('reposts')
        .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status, visibility')
        .eq('user_id', profileId)
        .eq('status', archivedOnly && viewerId === profileId ? 'archived' : 'active')
        .order('created_at', { ascending: false })
        .limit(20),
      adminSupabase
        .from('user_follows')
        .select('follower_id, following_id')
        .or(`follower_id.eq.${profileId},following_id.eq.${profileId}`),
      adminSupabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', profileId),
      adminSupabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', profileId),
      viewerId
        ? adminSupabase.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (followersCountError) throw followersCountError
    if (followingCountError) throw followingCountError
    if (blockedError && blockedError.code !== '42P01') throw blockedError

    const repostIdsByType = (type) => [...new Set((reposts || []).filter((repost) => repost.original_content_type === type).map((repost) => repost.original_content_id).filter(Boolean))]
    const repostOriginalQueries = [
      ['user_post', 'info_user_posts', 'id, user_id, title, content, created_at, updated_at, visibility', 'created_at'],
      ['blog', 'info_blogs', 'id, created_by, title, excerpt, content, featured_image, images, videos, media_layout, published_at, created_at, category', 'published_at'],
      ['forum_thread', 'forum_threads', 'id, created_by, title, content, created_at, category_id', 'created_at'],
      ['event', 'info_events', 'id, created_by, title, description, featured_image, images, start_date, created_at, category, status', 'start_date'],
    ].map(async ([type, table, fields, orderField]) => {
      const ids = repostIdsByType(type)
      if (!ids.length) return [type, []]
      const query = adminSupabase.from(table).select(fields).in('id', ids)
      if (!archivedOnly && (type === 'user_post' || type === 'forum_thread')) query.in('status', ['active', 'published'])
      if (!archivedOnly && (type === 'blog' || type === 'event')) query.eq('status', 'published')
      const { data } = await query.order(orderField, { ascending: false })
      return [type, data || []]
    })
    const repostOriginalEntries = await Promise.all(repostOriginalQueries)
    const repostOriginalByKey = new Map()
    repostOriginalEntries.forEach(([type, items]) => {
      items.forEach((item) => repostOriginalByKey.set(`${type}:${item.id}`, item))
    })
    const repostAuthorIds = [...new Set(repostOriginalEntries.flatMap(([, items]) => items.map((item) => item.user_id || item.created_by).filter(Boolean)))]
    const { data: repostAuthors } = repostAuthorIds.length
      ? await adminSupabase.from('info_users').select('id, full_name, profile_image_url, user_type').in('id', repostAuthorIds)
      : { data: [] }
    const repostAuthorsById = new Map((repostAuthors || []).map((author) => [author.id, author]))

    const contentRefs = [
      ...(userPosts || []).map((item) => ({ type: 'user_post', id: item.id })),
      ...(blogs || []).map((item) => ({ type: 'blog', id: item.id })),
      ...(threads || []).map((item) => ({ type: 'forum_thread', id: item.id })),
      ...(events || []).map((item) => ({ type: 'event', id: item.id })),
    ]
    const contentIds = filterValidUuidValues([...new Set(contentRefs.map((item) => item.id))])
    const [{ data: reactions }, { data: comments }] = contentIds.length
      ? await Promise.all([
        adminSupabase.from('content_reactions').select('content_type, content_id').in('content_id', contentIds),
        adminSupabase.from('content_comments').select('content_type, content_id').in('content_id', contentIds).eq('status', 'active'),
      ])
      : [{ data: [] }, { data: [] }]
    const engagementByKey = new Map()
    const addEngagement = (rows, field) => {
      ;(rows || []).forEach((row) => {
        const key = `${row.content_type}:${row.content_id}`
        const current = engagementByKey.get(key) || { reactions_count: 0, comments_count: 0 }
        current[field] += 1
        engagementByKey.set(key, current)
      })
    }
    addEngagement(reactions, 'reactions_count')
    addEngagement(comments, 'comments_count')
    const attachEngagement = (items, type) => (items || []).map((item) => ({
      ...item,
      ...(engagementByKey.get(`${type}:${item.id}`) || { reactions_count: 0, comments_count: 0 }),
    }))

    const repostContent = (reposts || []).map((repost) => {
      const original = repostOriginalByKey.get(`${repost.original_content_type}:${repost.original_content_id}`)
      if (!original) return null
      const originalAuthorId = original.user_id || original.created_by
      return {
        ...original,
        id: repost.id,
        repost_id: repost.id,
        reposted_by: repost.user_id,
        repost_quote: repost.quote_text,
        created_at: repost.created_at,
        reposted_at: repost.created_at,
        original_content_id: original.id,
        original_content_type: repost.original_content_type,
        original_author: repostAuthorsById.get(originalAuthorId) || { id: originalAuthorId, full_name: 'Community member' },
        original_post: {
          ...original,
          author: repostAuthorsById.get(originalAuthorId) || { id: originalAuthorId, full_name: 'Community member' },
        },
      }
    }).filter(Boolean)

    const relatedIds = [...new Set((followRows || []).flatMap((row) => [row.follower_id, row.following_id]).filter((id) => id && id !== profileId))]
    const { data: relatedUsers } = relatedIds.length
      ? await adminSupabase.from('info_users').select('id, full_name, profile_image_url, user_type').in('id', relatedIds)
      : { data: [] }
    const relatedUsersById = new Map((relatedUsers || []).map((user) => [user.id, user]))
    const followers = (followRows || []).filter((row) => row.following_id === profileId).map((row) => relatedUsersById.get(row.follower_id) || { id: row.follower_id, full_name: 'Community member' })
    const following = (followRows || []).filter((row) => row.follower_id === profileId).map((row) => relatedUsersById.get(row.following_id) || { id: row.following_id, full_name: 'Community member' })

    return NextResponse.json({
      success: true,
      viewer_id: viewerId,
      is_following: Boolean(followRow),
      is_followed_by: Boolean(reverseFollowRow),
      is_mutual: Boolean(followRow && reverseFollowRow),
      followers,
      following,
      followers_count: followersCount || 0,
      following_count: followingCount || 0,
      blocked_ids: (blockedRows || []).map((row) => row.blocked_id),
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
        user_posts: archivedOnly && viewerId === profileId ? [] : attachEngagement(userPosts, 'user_post'),
        archived_user_posts: archivedOnly && viewerId === profileId ? userPosts : [],
        blogs: attachEngagement(blogs, 'blog'),
        threads: attachEngagement(threads, 'forum_thread'),
        events: attachEngagement(events, 'event'),
        reposts: archivedOnly && viewerId === profileId ? [] : repostContent,
        archived_reposts: archivedOnly && viewerId === profileId ? repostContent : [],
      },
    })
  } catch (error) {
    console.error('Public profile API failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to load this profile right now.' }, { status: 500 })
  }
}
