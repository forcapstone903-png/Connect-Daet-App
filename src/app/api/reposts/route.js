import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_CONTENT_TYPES = new Set([
  'blog',
  'event',
  'amenity',
  'forum_thread',
  'announcement',
  'user_post',
])

function normalizeContentType(value) {
  const type = String(value || '').trim().toLowerCase()
  return type === 'forum' ? 'forum_thread' : type === 'post' ? 'user_post' : type
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id || null
  if (!userId) return NextResponse.json({ success: false, message: 'Please log in to repost.' }, { status: 401 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const contentType = normalizeContentType(body.contentType)
  const contentId = String(body.contentId || '').trim()
  const quoteText = String(body.quoteText || '').trim() || null

  if (!ALLOWED_CONTENT_TYPES.has(contentType) || !contentId) {
    return NextResponse.json({ success: false, message: 'Invalid repost content.' }, { status: 400 })
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await adminSupabase
    .from('reposts')
    .upsert({
      user_id: userId,
      original_content_type: contentType,
      original_content_id: contentId,
      quote_text: quoteText,
    }, { onConflict: 'user_id,original_content_type,original_content_id' })
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at')
    .single()

  if (error) {
    console.error('Repost insert failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to repost.' }, { status: 400 })
  }

  return NextResponse.json({ success: true, repost: data })
}
