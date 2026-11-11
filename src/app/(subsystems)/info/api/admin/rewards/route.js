import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { DEFAULT_REWARD_SETTINGS, validateRewardSettings } from '@/lib/rewardSettings.mjs'

export const dynamic = 'force-dynamic'

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
  if (!client) return response({ success: false, message: 'Rewards storage is not configured.' }, 503)

  const { data, error } = await client
    .from('admin_app_settings')
    .select('value, updated_at')
    .eq('id', 'rewards')
    .maybeSingle()

  if (error) {
    console.error('Admin rewards load failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to load saved reward settings.' }, 503)
  }

  const { settings, error: validationError } = validateRewardSettings(data?.value || DEFAULT_REWARD_SETTINGS)
  if (validationError) {
    console.error('Admin rewards data is invalid:', validationError)
    return response({ success: false, message: 'Saved reward settings are invalid. Contact a system administrator.' }, 503)
  }

  return response({
    success: true,
    settings,
    updatedAt: data?.updated_at || null,
  })
}

export async function PUT(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Rewards storage is not configured.' }, 503)

  let payload
  try {
    payload = await request.json()
  } catch {
    return response({ success: false, message: 'Request body must be valid JSON.' }, 400)
  }

  const { settings, error: validationError } = validateRewardSettings(payload?.settings)
  if (validationError) return response({ success: false, message: validationError }, 400)

  const { data, error } = await client
    .from('admin_app_settings')
    .upsert({
      id: 'rewards',
      value: settings,
      updated_by: session.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('value, updated_at')
    .single()

  if (error) {
    console.error('Admin rewards save failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to save reward settings.' }, 503)
  }

  return response({ success: true, settings: data.value, updatedAt: data.updated_at })
}
