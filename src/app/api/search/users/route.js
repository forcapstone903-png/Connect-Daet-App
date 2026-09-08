import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex]
      previous[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(previous[rightIndex] + 1, previous[rightIndex - 1] + 1, diagonal + 1)
      diagonal = saved
    }
  }

  return previous[right.length]
}

function tokenize(value) {
  return String(value || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function scoreUser(user, queryTokens) {
  const name = String(user.full_name || '').toLowerCase()
  const username = String(user.email || '').split('@')[0].toLowerCase()
  const bio = String(user.bio || '').toLowerCase()
  const location = `${user.city || ''} ${user.country || ''}`.toLowerCase()
  const nameTokens = tokenize(name)
  let score = 0

  queryTokens.forEach((token) => {
    if (name === token) score += 100
    else if (name.startsWith(token)) score += 80
    else if (nameTokens.some((nameToken) => nameToken === token)) score += 65
    else if (nameTokens.some((nameToken) => levenshteinDistance(nameToken, token) <= 1)) score += 45
    else if (name.includes(token)) score += 35

    if (bio.includes(token)) score += 20
    if (location.includes(token)) score += 15
    if (username === token) score += 100
    else if (username.startsWith(token)) score += 80
    else if (username.includes(token)) score += 35
  })

  return score
}

function matchesConnectionUser(user, query) {
  const name = String(user.full_name || '').toLowerCase()
  const username = String(user.email || '').split('@')[0].toLowerCase()
  const normalizedQuery = String(query || '').toLowerCase().trim()
  return !normalizedQuery || name.includes(normalizedQuery) || username.includes(normalizedQuery)
}

function scoreConnectionUser(user, query) {
  const name = String(user.full_name || '').toLowerCase()
  const username = String(user.email || '').split('@')[0].toLowerCase()
  const normalizedQuery = String(query || '').toLowerCase().trim()

  if (name === normalizedQuery || username === normalizedQuery) return 100
  if (name.startsWith(normalizedQuery) || username.startsWith(normalizedQuery)) return 80
  return 35
}

export async function GET(request) {
  if (!adminSupabase) {
    return NextResponse.json({ success: false, message: 'Search service is not configured.' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const query = String(searchParams.get('q') || '').trim()
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 10), 1), 5000)
  const connectionsOnly = searchParams.get('connectionsOnly') === 'true'
  if (!query && !connectionsOnly) return NextResponse.json({ success: true, users: [] })

  try {
    const viewerId = getServerSession(request)?.user_id || null
    const viewerFollowingResult = viewerId
      ? await adminSupabase.from('user_follows').select('following_id').eq('follower_id', viewerId)
      : { data: [] }
    const viewerFollowing = new Set((viewerFollowingResult.data || []).map((row) => row.following_id))
    const queryTokens = tokenize(query)

    let allowedConnectionIds = null
    if (connectionsOnly) {
      if (!viewerId) return NextResponse.json({ success: true, query, users: [] })

      const { data: viewerFollowers, error: followersError } = await adminSupabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', viewerId)
      if (followersError) throw followersError

      allowedConnectionIds = new Set([
        ...viewerFollowing,
        ...(viewerFollowers || []).map((row) => row.follower_id),
      ])
      allowedConnectionIds.delete(viewerId)

      if (!allowedConnectionIds.size) return NextResponse.json({ success: true, query, users: [] })
    }

    const userQuery = adminSupabase
      .from('info_users')
      .select('id, full_name, email, profile_image_url, bio, city, country, user_type, status')
      .eq('status', 'active')
      .neq('user_type', 'admin')
      .limit(5000)
    const scopedUserQuery = connectionsOnly ? userQuery.in('id', [...allowedConnectionIds]) : userQuery

    const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
      scopedUserQuery,
      connectionsOnly
        ? Promise.resolve({ data: [], error: null })
        : adminSupabase
          .from('profiles')
          .select('user_id, is_public, privacy_level')
          .limit(5000),
    ])

    if (usersError) throw usersError
    if (profilesError) throw profilesError

    const privacyById = new Map((profiles || []).map((profile) => [profile.user_id, profile.privacy_level || (profile.is_public === false ? 'private' : 'public')]))

    const resultLimit = connectionsOnly && !query ? allowedConnectionIds.size : limit
    const candidates = (users || [])
      .filter((user) => user.id !== viewerId)
      .filter((user) => connectionsOnly || privacyById.get(user.id) === 'public' || viewerFollowing.has(user.id))
      .filter((user) => !connectionsOnly || matchesConnectionUser(user, query))
      .map((user) => ({
        ...user,
        relevance_score: query
          ? (connectionsOnly ? scoreConnectionUser(user, query) : scoreUser(user, queryTokens))
          : 1,
      }))
      .filter((user) => !query || user.relevance_score > 0)
      .sort((left, right) => right.relevance_score - left.relevance_score || String(left.full_name || '').localeCompare(String(right.full_name || '')))
      .slice(0, resultLimit)

    const candidateIds = candidates.map((user) => user.id)
    const followerRows = candidateIds.length
      ? (await adminSupabase.from('user_follows').select('follower_id, following_id').in('following_id', candidateIds)).data || []
      : []
    const mutualIdsByUser = new Map()
    followerRows.forEach((row) => {
      if (!viewerFollowing.has(row.follower_id)) return
      const mutualIds = mutualIdsByUser.get(row.following_id) || []
      mutualIds.push(row.follower_id)
      mutualIdsByUser.set(row.following_id, mutualIds)
    })
    const mutualIds = [...new Set(followerRows.map((row) => row.follower_id).filter((id) => viewerFollowing.has(id)))]
    const mutualUsers = mutualIds.length
      ? (await adminSupabase.from('info_users').select('id, full_name, profile_image_url').in('id', mutualIds)).data || []
      : []
    const mutualById = new Map(mutualUsers.map((user) => [user.id, user]))

    return NextResponse.json({
      success: true,
      query,
      users: candidates.map((user) => ({
        id: user.id,
        full_name: user.full_name,
        username: String(user.email || '').split('@')[0] || null,
        profile_image_url: user.profile_image_url,
        bio: user.bio,
        city: user.city,
        country: user.country,
        user_type: user.user_type,
        relevance_score: user.relevance_score,
        mutual_friends: (mutualIdsByUser.get(user.id) || []).map((id) => mutualById.get(id)).filter(Boolean),
      })),
    })
  } catch (error) {
    console.error('User search failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to search users right now.' }, { status: 500 })
  }
}
