import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { hasValidInterestInput, normalizeUserInterests } from '@/lib/userInterests'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    : null
}

function respond(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return respond({ success: false, message: 'Please log in to manage your interests.' }, 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return respond({ success: false, message: 'Interest settings are not configured.' }, 500)

  try {
    const { data, error } = await adminSupabase
      .from('user_feed_preferences')
      .select('preferred_categories')
      .eq('user_id', session.user_id)
      .maybeSingle()
    if (error) throw error

    return respond({
      success: true,
      interests: normalizeUserInterests(data?.preferred_categories || []),
    })
  } catch (error) {
    console.error('User interests load failed:', error)
    return respond({ success: false, message: 'Unable to load your interests. Please try again.' }, 500)
  }
}

export async function PUT(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return respond({ success: false, message: 'Please log in to save your interests.' }, 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return respond({ success: false, message: 'Interest settings are not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A valid interests list is required.' }, 400)
  }
  if (!body || !hasValidInterestInput(body.interests)) {
    return respond({ success: false, message: 'Choose interests from the available categories.' }, 400)
  }

  try {
    const interests = normalizeUserInterests(body.interests)
    const { error } = await adminSupabase
      .from('user_feed_preferences')
      .upsert({
        user_id: session.user_id,
        preferred_categories: interests,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    if (error) throw error

    return respond({ success: true, interests })
  } catch (error) {
    console.error('User interests save failed:', error)
    return respond({ success: false, message: 'Unable to save your interests. Please try again.' }, 500)
  }
}
