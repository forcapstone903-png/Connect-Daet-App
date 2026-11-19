import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return respond({ success: false, message: 'Please log in to view recommendations.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ success: false, message: 'People recommendations are not configured.' }, 500)
  }

  let candidateIds
  try {
    const body = await request.json()
    if (!Array.isArray(body?.candidateIds) || body.candidateIds.length > 80
      || body.candidateIds.some((id) => typeof id !== 'string' || !USER_ID_PATTERN.test(id))) {
      return respond({ success: false, message: 'A valid list of people is required.' }, 400)
    }
    candidateIds = [...new Set(body.candidateIds)].filter((id) => id !== session.user_id)
  } catch {
    return respond({ success: false, message: 'A valid list of people is required.' }, 400)
  }

  if (candidateIds.length === 0) {
    return respond({ success: true, visible_user_ids: [], mutual_follower_user_ids: [] })
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const [
      { data: followRows, error: followsError },
      { data: users, error: usersError },
      { data: profiles, error: profilesError },
      { data: blockRows, error: blocksError },
    ] = await Promise.all([
      adminSupabase.from('user_follows').select('following_id').eq('follower_id', session.user_id),
      adminSupabase.from('info_users').select('id, user_type, status').in('id', candidateIds),
      adminSupabase.from('profiles').select('user_id, is_public, privacy_level, privacy_preferences').in('user_id', candidateIds),
      adminSupabase.from('user_blocks').select('blocker_id, blocked_id').or(
        `and(blocker_id.eq.${session.user_id},blocked_id.in.(${candidateIds.join(',')})),and(blocked_id.eq.${session.user_id},blocker_id.in.(${candidateIds.join(',')}))`
      ),
    ])
    if (followsError) throw followsError
    if (usersError) throw usersError
    if (profilesError) throw profilesError
    if (blocksError) throw blocksError

    const followedIds = new Set((followRows || []).map((row) => row.following_id).filter(Boolean))
    const blockedIds = new Set((blockRows || []).flatMap((row) => [row.blocker_id, row.blocked_id]))
    const profilesByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]))
    const visibleCandidateIds = (users || []).filter((user) => {
      if (user.status !== 'active'
        || ['admin', 'administrator'].includes(String(user.user_type || '').toLowerCase())
        || blockedIds.has(user.id)) return false
      const profile = profilesByUserId.get(user.id)
      if (profile?.privacy_preferences?.searchable === false) return false
      const privacyLevel = profile?.is_public === false
        ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
        : profile?.privacy_level || 'public'
      return privacyLevel === 'public' || followedIds.has(user.id)
    }).map((user) => user.id)

    if (!visibleCandidateIds.length || !followedIds.size) {
      return respond({ success: true, visible_user_ids: visibleCandidateIds, mutual_follower_user_ids: [] })
    }

    const { data: mutualRows, error: mutualError } = await adminSupabase
      .from('user_follows')
      .select('following_id')
      .in('following_id', visibleCandidateIds)
      .in('follower_id', [...followedIds])
    if (mutualError) throw mutualError

    const mutualCounts = new Map()
    for (const { following_id: candidateId } of mutualRows || []) {
      mutualCounts.set(candidateId, (mutualCounts.get(candidateId) || 0) + 1)
    }
    const mutualFollowerUserIds = visibleCandidateIds
      .filter((id) => mutualCounts.has(id))
      .sort((left, right) => mutualCounts.get(right) - mutualCounts.get(left)
        || candidateIds.indexOf(left) - candidateIds.indexOf(right))

    return respond({ success: true, visible_user_ids: visibleCandidateIds, mutual_follower_user_ids: mutualFollowerUserIds })
  } catch (error) {
    console.error('People recommendation lookup failed:', error)
    return respond({ success: false, message: 'Unable to load people recommendations right now.' }, 500)
  }
}
