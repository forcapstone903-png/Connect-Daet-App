import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return response({ success: false, message: 'User session is required.' }, 401)
  if (!adminSupabase) return response({ success: false, message: 'Rewards service is not configured.' }, 503)

  try {
    const payload = await request.json()
    const rewardId = payload?.rewardId
    if (typeof rewardId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(rewardId)) {
      return response({ success: false, message: 'A valid reward is required.' }, 400)
    }

    const { data, error } = await adminSupabase.rpc('redeem_configured_reward', {
      p_user_id: userId,
      p_reward_id: rewardId,
    })
    if (error) {
      console.error('Reward redemption transaction failed:', { code: error.code || null })
      return response({ success: false, message: 'Unable to redeem this reward right now.' }, 503)
    }
    if (!data?.success) {
      if (data?.code === 'insufficient_points') {
        return response({ success: false, message: `You need ${data.missing_points} more points to redeem this reward.` }, 400)
      }
      if (data?.code === 'already_redeemed') {
        return response({ success: false, message: 'You have already redeemed this reward.' }, 409)
      }
      if (data?.code === 'reward_unavailable') {
        return response({ success: false, message: 'That reward is unavailable.' }, 400)
      }
      return response({ success: false, message: 'Unable to redeem this reward.' }, 400)
    }

    // Confirm the redemption in the user's own notification inbox.
    const { error: notificationError } = await adminSupabase.from('info_notifications').insert({
      user_id: userId,
      title: 'Reward redeemed',
      message: `${data.title} redeemed for ${data.points_spent} points. You now have ${data.points} points.`,
      type: 'reward',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link: '/info/user/rewards',
    })
    if (notificationError) {
      console.error('Reward redemption notification failed:', { code: notificationError.code || null })
    }

    return response({
      success: true,
      points: data.points,
      rewardId,
      message: `${data.title} redeemed successfully.`,
      warning: notificationError ? 'Your reward was redeemed, but its notification could not be delivered.' : null,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return response({ success: false, message: 'Request body must be valid JSON.' }, 400)
    }
    console.error('Reward redemption failed:', error)
    return response({ success: false, message: 'Unable to redeem this reward.' }, 500)
  }
}