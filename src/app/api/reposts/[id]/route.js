import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key) : null
}

function isMissingRepostStatusColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes("'status' column of 'reposts'") ||
    message.includes('reposts.status') ||
    (message.includes('status') && message.includes('reposts') && message.includes('schema cache'))
  )
}

export async function PATCH(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const repostId = (await params)?.id
  if (!userId || !repostId) return NextResponse.json({ success: false, message: 'A repost and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const status = body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : null
  if (!status) return NextResponse.json({ success: false, message: 'Invalid repost status.' }, { status: 400 })

  const { data, error } = await adminSupabase
    .from('reposts')
    .update({ status })
    .eq('id', repostId)
    .eq('user_id', userId)
    .select('id, user_id, original_content_type, original_content_id, quote_text, created_at, status')
    .maybeSingle()

  if (error && isMissingRepostStatusColumnError(error)) {
    const legacy = await adminSupabase
      .from('reposts')
      .select('id, user_id, original_content_type, original_content_id, quote_text, created_at')
      .eq('id', repostId)
      .eq('user_id', userId)
      .maybeSingle()

    if (legacy.error) return NextResponse.json({ success: false, message: legacy.error.message }, { status: 400 })
    if (!legacy.data) return NextResponse.json({ success: false, message: 'Repost not found or not owned by you.' }, { status: 404 })
    return NextResponse.json({ success: true, repost: legacy.data, legacySchema: true })
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Repost not found or not owned by you.' }, { status: 404 })
  return NextResponse.json({ success: true, repost: data })
}

export async function DELETE(request, { params }) {
  const userId = getServerSession(request)?.user_id || null
  const repostId = (await params)?.id
  if (!userId || !repostId) return NextResponse.json({ success: false, message: 'A repost and user session are required.' }, { status: 400 })

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return NextResponse.json({ success: false, message: 'Repost service is not configured.' }, { status: 500 })

  const { data, error } = await adminSupabase
    .from('reposts')
    .delete()
    .eq('id', repostId)
    .eq('user_id', userId)
    .select('id, user_id, original_content_type, original_content_id')
    .maybeSingle()

  if (error && isMissingRepostStatusColumnError(error)) {
    const legacy = await adminSupabase
      .from('reposts')
      .delete()
      .eq('id', repostId)
      .eq('user_id', userId)
      .select('id, user_id, original_content_type, original_content_id')
      .maybeSingle()

    if (legacy.error) return NextResponse.json({ success: false, message: legacy.error.message }, { status: 400 })
    if (!legacy.data) return NextResponse.json({ success: false, message: 'Repost not found or not owned by you.' }, { status: 404 })
    return NextResponse.json({ success: true, repost: legacy.data, legacySchema: true })
  }

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ success: false, message: 'Repost not found or not owned by you.' }, { status: 404 })
  return NextResponse.json({ success: true, repost: data })
}
