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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'A signed-in account is required.' }, 401)

  const decisionId = new URL(request.url).searchParams.get('decision') || ''
  if (!isUuid(decisionId)) return respond({ success: false, message: 'A valid moderation decision is required.' }, 400)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Moderation details are not configured.' }, 503)

  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { data: decision, error } = await client
      .from('moderation_decisions')
      .select('id, case_id, decision_type, violation_category, reason, previous_status, new_status, suspension_duration_days, effective_at, expires_at, created_at')
      .eq('id', decisionId)
      .eq('affected_user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (!decision) return respond({ success: false, message: 'This moderation decision was not found.' }, 404)

    let report = null
    if (decision.case_id) {
      const { data, error: reportError } = await client
        .from('info_moderation')
        .select('id, report_type, reason, description, created_at')
        .eq('id', decision.case_id)
        .eq('reported_user_id', userId)
        .maybeSingle()
      if (reportError) throw reportError
      report = data || null
    }

    return respond({ success: true, decision, report })
  } catch (error) {
    console.error('User moderation detail load failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to load moderation details.' }, 500)
  }
}
