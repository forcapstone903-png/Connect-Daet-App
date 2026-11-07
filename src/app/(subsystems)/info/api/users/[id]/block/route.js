import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

async function getTargetUserId(params) {
  const resolvedParams = await params
  return resolvedParams?.id || null
}

export async function POST(request, { params }) {
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Block service is not configured.' }, { status: 500 })

  const blockerId = getServerSession(request)?.user_id || null
  const blockedId = await getTargetUserId(params)
  if (!blockerId) return NextResponse.json({ success: false, message: 'Please log in to block users.' }, { status: 401 })
  if (!blockedId || blockerId === blockedId) return NextResponse.json({ success: false, message: 'You cannot block this user.' }, { status: 400 })

  const { error: followError } = await adminSupabase
    .from('user_follows')
    .delete()
    .or(`and(follower_id.eq.${blockerId},following_id.eq.${blockedId}),and(follower_id.eq.${blockedId},following_id.eq.${blockerId})`)

  if (followError) return NextResponse.json({ success: false, message: 'Unable to remove the follow relationship.' }, { status: 500 })

  const { error } = await adminSupabase.from('user_blocks').upsert(
    { blocker_id: blockerId, blocked_id: blockedId },
    { onConflict: 'blocker_id,blocked_id' }
  )
  if (error) return NextResponse.json({ success: false, message: error.message || 'Unable to block this user.' }, { status: 500 })

  return NextResponse.json({ success: true, blocked: true })
}

export async function DELETE(request, { params }) {
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Block service is not configured.' }, { status: 500 })

  const blockerId = getServerSession(request)?.user_id || null
  const blockedId = await getTargetUserId(params)
  if (!blockerId) return NextResponse.json({ success: false, message: 'Please log in to unblock users.' }, { status: 401 })
  if (!blockedId || blockerId === blockedId) return NextResponse.json({ success: false, message: 'Invalid block relationship.' }, { status: 400 })

  const { error } = await adminSupabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)

  if (error) return NextResponse.json({ success: false, message: error.message || 'Unable to unblock this user.' }, { status: 500 })
  return NextResponse.json({ success: true, blocked: false })
}
