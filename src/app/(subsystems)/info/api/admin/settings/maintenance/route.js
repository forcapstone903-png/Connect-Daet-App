import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function missingConfig() {
  return response({ success: false, message: 'Maintenance settings are not configured on the server.' }, 500)
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { data, error } = await adminSupabase
    .from('site_maintenance_settings')
    .select('enabled, message, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error || !data) {
    console.error('Admin maintenance settings read failed:', error || 'Settings row is missing')
    return response({ success: false, message: 'Unable to load maintenance settings.' }, 500)
  }

  return response({ success: true, settings: data })
}

export async function PUT(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'A valid JSON request body is required.' }, 400)
  }

  if (typeof body?.enabled !== 'boolean') {
    return response({ success: false, message: 'Maintenance enabled must be a boolean.' }, 400)
  }

  if (typeof body.message !== 'string' || !body.message.trim() || body.message.trim().length > 500) {
    return response({ success: false, message: 'Enter a maintenance message between 1 and 500 characters.' }, 400)
  }

  const { data, error } = await adminSupabase
    .from('site_maintenance_settings')
    .upsert({
      id: 1,
      enabled: body.enabled,
      message: body.message.trim(),
      updated_by: session.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('enabled, message, updated_at')
    .single()

  if (error) {
    console.error('Admin maintenance settings write failed:', error)
    return response({ success: false, message: 'Unable to save maintenance settings.' }, 500)
  }

  return response({ success: true, settings: data })
}
