import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'A signed-in account is required.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Account status is not configured.' }, 503)

  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const [{ data: account, error: accountError }, { data: restrictions, error: restrictionsError }] = await Promise.all([
      client.from('info_users')
        .select('status')
        .eq('id', userId)
        .maybeSingle(),
      client.from('admin_user_bans')
        .select('id, reason, ban_type, banned_at, expires_at')
        .eq('user_id', userId)
        .in('ban_type', ['permanent', 'suspension'])
        .is('lifted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('banned_at', { ascending: false }),
    ])
    if (accountError) throw accountError
    if (restrictionsError) throw restrictionsError
    if (!account) return respond({ success: false, message: 'The account profile was not found.' }, 404)

    const restriction = (restrictions || []).find((item) => item.ban_type === 'permanent')
      || (restrictions || []).find((item) => item.ban_type === 'suspension')
      || null
    const status = account.status === 'banned' || restriction?.ban_type === 'permanent'
      ? 'banned'
      : account.status === 'suspended' || restriction?.ban_type === 'suspension'
        ? 'suspended'
        : account.status || 'active'

    return respond({
      success: true,
      status,
      reason: restriction?.reason || null,
      startedAt: restriction?.banned_at || null,
      expiresAt: status === 'suspended' ? restriction?.expires_at || null : null,
      restrictionId: restriction?.id || null,
    })
  } catch (error) {
    console.error('Account status lookup failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to load account status.' }, 500)
  }
}