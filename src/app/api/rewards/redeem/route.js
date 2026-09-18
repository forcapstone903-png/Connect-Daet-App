import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

const rewards = new Map([
  ['Local food voucher', 500],
  ['Weekend attraction pass', 900],
  ['Community souvenir pack', 1400],
])

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Rewards service is not configured.' }, { status: 500 })

  try {
    const { title } = await request.json()
    const pointsRequired = rewards.get(title)
    if (!pointsRequired) return NextResponse.json({ success: false, message: 'That reward is unavailable.' }, { status: 400 })

    const { data: user, error: userError } = await adminSupabase
      .from('info_users')
      .select('points')
      .eq('id', userId)
      .maybeSingle()
    if (userError) throw userError

    const currentPoints = Number(user?.points || 0)
    if (currentPoints < pointsRequired) {
      return NextResponse.json({ success: false, message: `You need ${pointsRequired - currentPoints} more points to redeem this reward.` }, { status: 400 })
    }

    const nextPoints = currentPoints - pointsRequired
    const { data: updatedUser, error: updateError } = await adminSupabase
      .from('info_users')
      .update({ points: nextPoints, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('points', currentPoints)
      .select('points')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updatedUser) return NextResponse.json({ success: false, message: 'Your points changed. Please try again.' }, { status: 409 })

    const [{ error: pointsError }, { error: historyError }] = await Promise.all([
      adminSupabase.from('user_points').insert({ user_id: userId, points: -pointsRequired, reason: `Redeemed ${title}`, source: 'reward_redemption' }),
      adminSupabase.from('reward_history').insert({ user_id: userId, points_earned: -pointsRequired, subsystem_source: 'reward_redemption', description: title }),
    ])
    if (pointsError) throw pointsError
    if (historyError) throw historyError

    // Confirm the redemption in the user's own notification inbox.
    const { error: notificationError } = await adminSupabase.from('info_notifications').insert({
      user_id: userId,
      title: 'Reward redeemed',
      message: `${title} redeemed for ${pointsRequired} points. You now have ${nextPoints} points.`,
      type: 'reward',
      is_read: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      link: '/user/rewards',
    })
    if (notificationError) console.error('Reward redemption notification failed:', notificationError)

    return NextResponse.json({ success: true, points: nextPoints, message: `${title} redeemed successfully.` })
  } catch (error) {
    console.error('Reward redemption failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to redeem this reward.' }, { status: 500 })
  }
}