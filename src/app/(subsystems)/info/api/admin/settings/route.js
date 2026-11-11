import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'

const ALLOWED_SETTINGS = new Set(['general', 'moderation', 'announcement'])
const MAX_SETTING_BYTES = 20 * 1024

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Admin settings storage is not configured.' }, 503)

  const { data, error } = await client
    .from('admin_app_settings')
    .select('id, value, updated_at')
    .order('id')

  if (error) {
    console.error('Admin settings load failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to load saved administrator settings.' }, 503)
  }

  return response({
    success: true,
    settings: Object.fromEntries((data || []).map((row) => [row.id, row.value])),
    updatedAt: Object.fromEntries((data || []).map((row) => [row.id, row.updated_at])),
  })
}

export async function PUT(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Admin settings storage is not configured.' }, 503)

  let payload
  try {
    payload = await request.json()
  } catch {
    return response({ success: false, message: 'Request body must be valid JSON.' }, 400)
  }

  const { id, value } = payload || {}
  if (!ALLOWED_SETTINGS.has(id) || !value || typeof value !== 'object' || Array.isArray(value)) {
    return response({ success: false, message: 'A supported settings key and object value are required.' }, 400)
  }

  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SETTING_BYTES) {
    return response({ success: false, message: 'Settings exceed the supported size limit.' }, 413)
  }

  const { data, error } = await client
    .from('admin_app_settings')
    .upsert({ id, value, updated_by: session.user_id, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('id, value, updated_at')
    .single()

  if (error) {
    console.error('Admin settings save failed:', { id, code: error.code || null })
    return response({ success: false, message: 'Unable to save administrator settings.' }, 503)
  }

  return response({ success: true, setting: data })
}
