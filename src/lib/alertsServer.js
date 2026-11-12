// Server-only helpers shared by the alert API routes.
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let cachedClient = null
export function getServiceClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return cachedClient
}

const PRIVATE = { 'Cache-Control': 'private, no-store, max-age=0' }

export function json(body, status = 200, headers = PRIVATE) {
  return NextResponse.json(body, { status, headers })
}

export const fail = (status, message) => json({ success: false, message }, status)

export const missingConfig = () => fail(500, 'Alerts are not configured on the server.')

export async function readJsonBody(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return { error: fail(403, 'Cross-origin requests are not allowed.') }
  }
  try {
    return { body: await request.json() }
  } catch {
    return { error: fail(400, 'A valid JSON request body is required.') }
  }
}

export async function writeAudit(client, userId, action, recordId, changes = {}, table = 'alerts') {
  const { error } = await client.from('info_audit_log').insert({
    user_id: userId,
    action,
    table_name: table,
    record_id: recordId,
    changes,
  })
  if (error) console.error('Alert audit log write failed:', error)
}

export async function loadActiveCategorySlugs(client) {
  const { data, error } = await client.from('alert_categories').select('slug').eq('is_active', true)
  if (error) throw error
  return (data || []).map((row) => row.slug)
}

/** Postgres error from the alert RPCs -> HTTP response. */
export function rpcError(error, fallback) {
  const message = String(error?.message || '')
  if (message.includes('alert_not_found')) return fail(404, 'Alert not found.')
  if (message.includes('alert_not_active')) return fail(409, 'Only an active alert can be marked all clear.')
  console.error(fallback, error)
  return fail(500, fallback)
}
