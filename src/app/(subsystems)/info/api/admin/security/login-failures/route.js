import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getSettingsClient } from '@/lib/appSettingsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Administrator-only (no staffRoles rule -> system.manage). Emails are shown
// only as the masked hint stored at failure time; the lockout key itself is
// an HMAC, so the full address is never stored or returned.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const HASH_PATTERN = /^[0-9a-f]{64}$/
const respond = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Not configured on the server.' }, 500)

  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const [failures, events] = await Promise.all([
    client.from('auth_login_failures').select('*').order('updated_at', { ascending: false }).limit(200),
    client.from('info_audit_log')
      .select('created_at', { count: 'exact' })
      .eq('action', 'login_failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000),
  ])
  if (failures.error) {
    console.error('Login failure list failed:', failures.error)
    return respond({ success: false, message: 'Unable to load failed sign-ins.' }, 500)
  }

  const perDay = {}
  for (const row of events.data || []) {
    const day = row.created_at.slice(0, 10)
    perDay[day] = (perDay[day] || 0) + 1
  }
  const now = Date.now()
  return respond({
    success: true,
    failures: (failures.data || []).map((row) => ({
      key: row.email_hash,
      email: row.email_hint || 'Unknown (recorded before hints were stored)',
      failureCount: row.failure_count,
      windowStartedAt: row.window_started_at,
      lastFailedAt: row.last_failed_at || row.updated_at,
      lockedUntil: row.locked_until,
      locked: Boolean(row.locked_until && new Date(row.locked_until).getTime() > now),
    })),
    last7Days: { total: events.error ? null : events.count || 0, perDay },
  })
}

// Body: { key } — unlock an address and reset its failure count.
export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'Not configured on the server.' }, 500)

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403)
  }
  const body = await request.json().catch(() => null)
  const key = String(body?.key || '')
  if (!HASH_PATTERN.test(key)) return respond({ success: false, message: 'A valid entry is required.' }, 400)

  const { data: row } = await client.from('auth_login_failures').select('email_hint').eq('email_hash', key).maybeSingle()
  const { error } = await client.rpc('clear_auth_login_failures', { p_email_hash: key })
  if (error) {
    console.error('Login failure reset failed:', error)
    return respond({ success: false, message: 'Unable to unlock this address.' }, 500)
  }
  const { error: auditError } = await client.from('info_audit_log').insert({
    user_id: session.user_id,
    action: 'login_lockout_cleared',
    table_name: 'auth_login_failures',
    changes: { email_hint: row?.email_hint || null },
  })
  if (auditError) console.error('Lockout clear audit failed:', auditError)
  return respond({ success: true })
}
