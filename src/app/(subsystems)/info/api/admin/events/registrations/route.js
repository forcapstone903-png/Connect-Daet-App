import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    return NextResponse.json({ success: false, message: 'Event registrations are not configured.' }, { status: 500 })
  }

  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await client
    .from('event_registrations')
    .select('id, event_id, user_id, status, created_at, info_users(id, full_name, email)')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) {
    console.error('Admin event registrations lookup failed:', error.message)
    return NextResponse.json({ success: false, message: 'Unable to load event registrations.' }, { status: 500 })
  }

  const registrationsByEvent = {}
  for (const registration of data || []) {
    if (!registrationsByEvent[registration.event_id]) registrationsByEvent[registration.event_id] = []
    registrationsByEvent[registration.event_id].push({
      id: registration.id,
      user_id: registration.user_id,
      name: registration.info_users?.full_name || 'Account holder',
      email: registration.info_users?.email || '',
      status: registration.status,
      created_at: registration.created_at,
    })
  }

  return NextResponse.json({ success: true, registrationsByEvent }, {
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}
