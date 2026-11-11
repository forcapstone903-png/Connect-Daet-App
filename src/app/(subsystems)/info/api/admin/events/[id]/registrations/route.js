import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

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

export async function GET(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Event registrations are not configured.' }, 500)
  const eventId = (await params)?.id
  if (!eventId) return respond({ success: false, message: 'An event is required.' }, 400)

  const { data, error } = await client
    .from('event_registrations')
    .select('id, event_id, user_id, status, created_at, info_users(id, full_name, email)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) return respond({ success: false, message: 'Unable to load event registrations.' }, 500)
  return respond({ success: true, registrations: data || [] })
}

export async function PATCH(request, { params }) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Event registrations are not configured.' }, 500)
  const eventId = (await params)?.id
  const body = await request.json().catch(() => ({}))
  const registrationId = String(body.registrationId || '')
  const status = body.status
  if (!eventId || !registrationId || !['confirmed', 'cancelled'].includes(status)) {
    return respond({ success: false, message: 'Choose a valid registration and status.' }, 400)
  }

  const { data, error } = await client
    .from('event_registrations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .select('id, event_id, user_id, status, created_at, info_users(id, full_name, email)')
    .maybeSingle()
  if (error) return respond({ success: false, message: 'Unable to update the event registration.' }, 500)
  if (!data) return respond({ success: false, message: 'Registration not found.' }, 404)
  return respond({ success: true, registration: data })
}
