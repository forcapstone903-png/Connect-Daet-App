import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getAdminClient()
  if (!client) return NextResponse.json({ success: false, message: 'Forum administration is not configured.' }, { status: 500 })

  const { data, error } = await client.from('forum_categories').select('id, name, description').order('name')
  if (error) return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
  return NextResponse.json({ success: true, categories: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getAdminClient()
  if (!client) return NextResponse.json({ success: false, message: 'Forum administration is not configured.' }, { status: 500 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'A category name is required.' }, { status: 400 })
  }
  const name = String(body?.name || '').trim()
  if (!name || name.length > 80) {
    return NextResponse.json({ success: false, message: 'Category names must be between 1 and 80 characters.' }, { status: 400 })
  }

  const { data, error } = await client
    .from('forum_categories')
    .insert({ name, description: String(body?.description || '').trim() || null })
    .select('id, name, description')
    .single()
  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json({
      success: false,
      message: duplicate ? 'That forum category already exists.' : error.message,
    }, { status: duplicate ? 409 : 500 })
  }
  return NextResponse.json({ success: true, category: data }, { status: 201 })
}
