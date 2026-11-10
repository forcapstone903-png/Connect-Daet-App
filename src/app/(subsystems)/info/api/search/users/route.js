import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function tokenize(value) {
  return String(value || '').toLowerCase().trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function scoreUser(user, queryTokens) {
  const nameTokens = tokenize(user.full_name)
  let score = 0

  for (const queryToken of queryTokens) {
    const match = nameTokens.find((token) => token === queryToken || token.startsWith(queryToken) || token.includes(queryToken))
    if (!match) return 0
    score += match === queryToken ? 100 : match.startsWith(queryToken) ? 75 : 50
  }

  const normalizedName = nameTokens.join(' ')
  const normalizedQuery = queryTokens.join(' ')
  if (normalizedName === normalizedQuery) score += 50

  return nameTokens.length ? score : 0
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
  const connectionsOnly = searchParams.get('connectionsOnly') === 'true'
  const requestedLimit = Number(searchParams.get('limit') || 10)
  const limit = Math.min(Math.max(requestedLimit, 1), connectionsOnly ? 5000 : 50)
  const includeSocial = searchParams.get('includeSocial') !== 'false'
  const suggestionsOnly = searchParams.get('suggestionsOnly') === 'true'
  if (!query && !connectionsOnly) return NextResponse.json({ success: true, users: [] })

  try {
    const viewerId = getServerSession(request)?.user_id || null
    const viewerFollowingResult = viewerId
      ? await adminSupabase.from('user_follows').select('following_id').eq('follower_id', viewerId)
      : { data: [] }
    const viewerFollowing = new Set((viewerFollowingResult.data || []).map((row) => row.following_id))
    const queryTokens = tokenize(query)
    if (query && !queryTokens.length && !connectionsOnly) {
      return NextResponse.json({ success: true, query, users: [] })
    }

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

    let userQuery = adminSupabase
      .from('info_users')
      .select(suggestionsOnly
        ? 'id, full_name, profile_image_url, user_type, status'
        : 'id, full_name, email, profile_image_url, bio, city, country, user_type, status')
      .eq('status', 'active')
      .neq('user_type', 'admin')
    if (query && !connectionsOnly) {
      queryTokens.forEach((token) => {
        userQuery = userQuery.ilike('full_name', `%${token}%`)
      })
    }
    const candidateLimit = query && !connectionsOnly
      ? Math.min(Math.max(limit * 10, 100), 500)
      : connectionsOnly && !query
        ? limit
        : Math.min(limit, 50)
    userQuery = userQuery.order('full_name', { ascending: true }).limit(candidateLimit)
    const scopedUserQuery = connectionsOnly ? userQuery.in('id', [...allowedConnectionIds]) : userQuery

    const { data: users, error: usersError } = await scopedUserQuery

    if (usersError) throw usersError

    const candidateIds = (users || []).map((user) => user.id)
    const { data: profiles, error: profilesError } = candidateIds.length
      ? await adminSupabase
        .from('profiles')
        .select('user_id, is_public, privacy_level, privacy_preferences')
        .in('user_id', candidateIds)
      : { data: [], error: null }
    if (profilesError) throw profilesError

    const profilesById = new Map((profiles || []).map((profile) => [profile.user_id, profile]))

    const resultLimit = limit
    const candidates = (users || [])
      .filter((user) => user.id !== viewerId)
      .filter((user) => profilesById.get(user.id)?.privacy_preferences?.searchable !== false)
      .filter((user) => {
        const profile = profilesById.get(user.id)
        const privacyLevel = profile?.is_public === false
          ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
          : profile?.privacy_level || 'public'
        if (privacyLevel === 'private') return true
        return privacyLevel === 'public' || viewerFollowing.has(user.id)
      })
      .filter((user) => !connectionsOnly || matchesConnectionUser(user, query))
      .map((user) => ({
        ...user,
        is_private: (profilesById.get(user.id)?.is_public === false
          ? (['followers', 'private'].includes(profilesById.get(user.id)?.privacy_level) ? profilesById.get(user.id)?.privacy_level : 'followers')
          : profilesById.get(user.id)?.privacy_level || 'public') === 'private',
        relevance_score: query
          ? (connectionsOnly ? scoreConnectionUser(user, query) : scoreUser(user, queryTokens))
          : 1,
      }))
      .filter((user) => !query || user.relevance_score > 0)
      .sort((left, right) => right.relevance_score - left.relevance_score || String(left.full_name || '').localeCompare(String(right.full_name || '')))
      .slice(0, resultLimit)

    const visibleCandidateIds = candidates.map((user) => user.id)
    const followerRows = includeSocial && visibleCandidateIds.length
      ? (await adminSupabase.from('user_follows').select('follower_id, following_id').in('following_id', visibleCandidateIds)).data || []
      : []
    const mutualIdsByUser = new Map()
    followerRows.forEach((row) => {
      if (!viewerFollowing.has(row.follower_id)) return
      const mutualIds = mutualIdsByUser.get(row.following_id) || []
      mutualIds.push(row.follower_id)
      mutualIdsByUser.set(row.following_id, mutualIds)
    })
    const mutualIds = [...new Set(followerRows.map((row) => row.follower_id).filter((id) => viewerFollowing.has(id)))]
    const mutualUsers = includeSocial && mutualIds.length
      ? (await adminSupabase.from('info_users').select('id, full_name, profile_image_url').in('id', mutualIds)).data || []
      : []
    const mutualById = new Map(mutualUsers.map((user) => [user.id, user]))

    return NextResponse.json({
      success: true,
      query,
      users: candidates.map((user) => suggestionsOnly
        ? {
          id: user.id,
          full_name: user.full_name,
          profile_image_url: user.profile_image_url,
        }
        : user.is_private && !viewerFollowing.has(user.id)
          ? {
          id: user.id,
          full_name: user.full_name,
          profile_image_url: user.profile_image_url,
          user_type: user.user_type,
          relevance_score: user.relevance_score,
          is_private: true,
        }
        : {
          id: user.id,
          full_name: user.full_name,
          username: String(user.email || '').split('@')[0] || null,
          profile_image_url: user.profile_image_url,
          bio: user.bio,
          city: user.city,
          country: user.country,
          user_type: user.user_type,
          relevance_score: user.relevance_score,
          is_private: user.is_private,
          mutual_friends: (mutualIdsByUser.get(user.id) || []).map((id) => mutualById.get(id)).filter(Boolean),
        }),
    })
  } catch (error) {
    console.error('User search failed:', error)
    return NextResponse.json({ success: false, message: 'Unable to search users right now.' }, { status: 500 })
  }
}
