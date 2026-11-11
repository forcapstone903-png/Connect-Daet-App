import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { DEFAULT_REWARD_SETTINGS, validateRewardSettings } from '@/lib/rewardSettings.mjs'

export const dynamic = 'force-dynamic'

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return response({ success: false, message: 'User session is required.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return response({ success: false, message: 'Rewards service is not configured.' }, 503)

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const [{ data: settingsRow, error: settingsError }, { data: redemptions, error: redemptionsError }] = await Promise.all([
    client.from('admin_app_settings').select('value').eq('id', 'rewards').maybeSingle(),
    client.from('reward_redemptions').select('reward_id').eq('user_id', userId),
  ])

  if (settingsError || redemptionsError) {
    console.error('Reward catalog load failed:', {
      settingsCode: settingsError?.code || null,
      redemptionsCode: redemptionsError?.code || null,
    })
    return response({ success: false, message: 'Unable to load the current reward catalog.' }, 503)
  }

  const { settings, error: validationError } = validateRewardSettings(settingsRow?.value || DEFAULT_REWARD_SETTINGS)
  if (validationError) {
    console.error('Rewards catalog settings are invalid:', validationError)
    return response({ success: false, message: 'The current reward catalog is unavailable.' }, 503)
  }

  return response({
    success: true,
    rewards: settings.rewards.filter((reward) => reward.enabled),
    milestones: settings.milestones,
    redeemedRewardIds: (redemptions || []).map((redemption) => redemption.reward_id),
  })
}
