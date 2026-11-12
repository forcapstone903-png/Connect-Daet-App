import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { canManageAppSetting } from '@/lib/adminSettingsAccess.mjs'
import { invalidateAppSettings } from '@/lib/appSettingsServer'
import { normalizeSetting, resolveSetting } from '@/lib/siteSettings.mjs'

export const dynamic = 'force-dynamic'

const RESOLVED_IDS = ['general', 'security', 'notifications', 'email', 'messaging']
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
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Admin settings storage is not configured.' }, 503)

  const canReadAllSettings = canManageAppSetting(session, 'security')
  let settingsQuery = client
    .from('admin_app_settings')
    .select('id, value, updated_at')
  if (!canReadAllSettings) settingsQuery = settingsQuery.eq('id', 'general')
  const { data, error } = await settingsQuery.order('id')

  if (error) {
    console.error('Admin settings load failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to load saved administrator settings.' }, 503)
  }

  const settingIds = canReadAllSettings
    ? [...new Set([...RESOLVED_IDS, ...(data || []).map((row) => row.id)])]
    : ['general']
  return response({
    success: true,
    settings: Object.fromEntries(
      settingIds
        .map((id) => [id, resolveSetting(id, (data || []).find((row) => row.id === id)?.value)])
    ),
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

  const id = payload?.id
  if (!canManageAppSetting(session, id)) {
    return response({ success: false, message: 'Your role cannot update this setting.' }, 403)
  }
  const { value, error: validationError } = normalizeSetting(id, payload?.value)
  if (validationError) return response({ success: false, message: validationError }, 400)

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

  invalidateAppSettings(id)

  const { error: auditError } = await client.from('info_audit_log').insert({
    user_id: session.user_id,
    action: 'setting_updated',
    table_name: 'admin_app_settings',
    changes: ['security', 'notifications', 'email'].includes(id)
      ? { setting: id, values: value }
      : { setting: id, fields: Object.keys(value).sort() },
  })
  if (auditError) {
    console.error('Admin settings audit record failed:', { id, code: auditError.code || null })
  }

  return response({ success: true, setting: data })
}
