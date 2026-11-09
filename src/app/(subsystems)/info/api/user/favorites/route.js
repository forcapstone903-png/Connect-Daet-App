import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FAVORITE_TYPES = new Set(['blog', 'event', 'spot', 'forum', 'user_post', 'announcement'])
const noCacheHeaders = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function failure(message, status) {
  return NextResponse.json({ success: false, message }, { status, headers: noCacheHeaders })
}

function normalizeFavoriteType(value) {
  if (value === 'post') return 'user_post'
  if (value === 'tourist_spot') return 'spot'
  if (value === 'forum_thread') return 'forum'
  return value
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return failure('User session is required.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return failure('Saved items service is not configured.', 500)

  try {
    const { data, error } = await adminSupabase
      .from('user_favorites')
      .select('item_type, item_id')
      .eq('user_id', userId)
      .limit(100)
    if (error) throw error

    return NextResponse.json({ success: true, favorites: data || [] }, { headers: noCacheHeaders })
  } catch (error) {
    console.error('Saved items fetch failed:', error)
    return failure(error.message || 'Unable to load saved items.', 500)
  }
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return failure('User session is required.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return failure('Saved items service is not configured.', 500)

  let body
  try {
    body = await request.json()
  } catch {
    return failure('A valid saved item is required.', 400)
  }

  const itemType = normalizeFavoriteType(body?.itemType)
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : ''
  if (!FAVORITE_TYPES.has(itemType) || !isValidUuid(itemId)) {
    return failure('A valid saved item is required.', 400)
  }
  if (!['save', 'remove'].includes(body?.action)) {
    return failure('A valid saved item action is required.', 400)
  }

  try {
    const result = body.action === 'save'
      ? await adminSupabase
        .from('user_favorites')
        .upsert({ user_id: userId, item_type: itemType, item_id: itemId }, { onConflict: 'user_id,item_type,item_id' })
      : await adminSupabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('item_type', itemType)
        .eq('item_id', itemId)
    if (result.error) throw result.error

    return NextResponse.json({ success: true }, { headers: noCacheHeaders })
  } catch (error) {
    console.error('Saved item update failed:', error)
    return failure(error.message || 'Unable to update saved items.', 500)
  }
}
