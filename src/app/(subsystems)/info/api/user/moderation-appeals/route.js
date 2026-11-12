import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { notifyAdministrators } from '@/lib/adminNotifications'
import { getActivePublishingRestriction } from '@/lib/contentRestrictions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'Please log in to view moderation appeals.' }, 401)

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation appeals are not configured.' }, 500)

  try {
    const [restriction, appealResult] = await Promise.all([
      getActivePublishingRestriction(client, userId),
      client.from('user_moderation_appeals')
        .select('id, reason, status, decision_notes, reviewed_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    if (appealResult.error) throw appealResult.error

    return respond({ success: true, restriction, appeals: appealResult.data || [] })
  } catch (error) {
    console.error('User moderation appeals load failed:', error)
    return respond({ success: false, message: 'Unable to load your moderation appeal information.' }, 500)
  }
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'Please log in to submit an appeal.' }, 401)

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation appeals are not configured.' }, 500)

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return respond({ success: false, message: 'A valid appeal request is required.' }, 400)
    }
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason || reason.length > 2000) {
      return respond({ success: false, message: 'Your appeal must be between 1 and 2,000 characters.' }, 400)
    }

    const restriction = await getActivePublishingRestriction(client, userId)
    if (!restriction) return respond({ success: false, message: 'There is no active posting restriction to appeal.' }, 409)

    const { data: appeal, error } = await client
      .from('user_moderation_appeals')
      .insert({ user_id: userId, reason })
      .select('id, reason, status, created_at')
      .single()

    if (error?.code === '23505') {
      return respond({ success: false, message: 'You already have a pending appeal.' }, 409)
    }
    if (error) throw error

    await notifyAdministrators(client, {
      title: 'Posting restriction appeal',
      message: 'A user has submitted an appeal for a posting restriction.',
      type: 'warning',
      link: '/info/admin/moderation',
    })

    return respond({ success: true, appeal }, 201)
  } catch (error) {
    console.error('User moderation appeal submission failed:', error)
    return respond({ success: false, message: 'Unable to submit your appeal right now.' }, 500)
  }
}
