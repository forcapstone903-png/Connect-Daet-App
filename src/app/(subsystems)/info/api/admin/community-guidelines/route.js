import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'

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
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Community guidelines are not configured.' }, 500)

  const { data, error } = await client.from('admin_app_settings')
    .select('value, updated_at')
    .eq('id', 'community-guidelines')
    .maybeSingle()
  if (error) {
    console.error('Community guidelines load failed:', error)
    return respond({ success: false, message: 'Unable to load community guidelines.' }, 500)
  }
  if (!data) return respond({ success: false, message: 'Community guidelines have not been configured.' }, 404)
  return respond({ success: true, content: data.value?.content || '', updatedAt: data.updated_at })
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Community guidelines are not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'Guidelines content is required.' }, 400)
  }
  const content = String(body?.content || '').trim()
  if (!content || content.length > 20000) {
    return respond({ success: false, message: 'Guidelines must be between 1 and 20,000 characters.' }, 400)
  }

  const now = new Date().toISOString()
  const { data: current, error: settingsError } = await client.from('admin_app_settings')
    .select('value')
    .eq('id', 'community-guidelines')
    .maybeSingle()
  if (settingsError) {
    console.error('Community guidelines lookup failed:', settingsError)
    return respond({ success: false, message: 'Unable to save community guidelines.' }, 500)
  }
  const { error } = await client.from('admin_app_settings').upsert({
    id: 'community-guidelines',
    value: { ...(current?.value || {}), content },
    updated_by: authorization.session.user_id,
    updated_at: now,
  }, { onConflict: 'id' })
  if (error) {
    console.error('Community guidelines save failed:', error)
    return respond({ success: false, message: 'Unable to save community guidelines.' }, 500)
  }

  const { error: auditError } = await client.from('info_audit_log').insert({
    user_id: authorization.session.user_id,
    action: 'update-community-guidelines',
    table_name: 'admin_app_settings',
    changes: { characterCount: content.length },
  })
  if (auditError) {
    console.error('Community guidelines audit log failed:', auditError)
    return respond({ success: false, message: 'Guidelines were saved, but the audit record could not be written.' }, 500)
  }
  return respond({ success: true, content, updatedAt: now })
}
