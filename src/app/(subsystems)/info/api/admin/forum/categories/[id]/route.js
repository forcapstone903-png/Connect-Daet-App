import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'
import { publicErrorMessage } from '@/lib/publicError'

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

export async function PATCH(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Forum administration is not configured.' }, 500)

  const { id } = await params
  if (!isValidUuid(id)) return respond({ success: false, message: 'A valid forum category is required.' }, 400)
  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A category name is required.' }, 400)
  }
  const name = String(body?.name || '').trim()
  const description = String(body?.description || '').trim()
  if (!name || name.length > 80 || description.length > 500) {
    return respond({ success: false, message: 'Category names must be 1-80 characters and descriptions no more than 500.' }, 400)
  }

  const { data, error } = await client.from('forum_categories')
    .update({ name, description: description || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, description')
    .maybeSingle()
  if (error) {
    const duplicate = error.code === '23505'
    return respond({ success: false, message: duplicate ? 'That forum category already exists.' : error.message }, duplicate ? 409 : 500)
  }
  if (!data) return respond({ success: false, message: 'Forum category not found.' }, 404)
  return respond({ success: true, category: data })
}

export async function DELETE(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Forum administration is not configured.' }, 500)

  const { id } = await params
  if (!isValidUuid(id)) return respond({ success: false, message: 'A valid forum category is required.' }, 400)
  const { count, error: countError } = await client.from('forum_threads')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
  if (countError) return respond({ success: false, message: publicErrorMessage(countError) }, 500)
  if (count) return respond({ success: false, message: 'Move or delete this category threads before deleting the category.' }, 409)

  const { data, error } = await client.from('forum_categories')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return respond({ success: false, message: publicErrorMessage(error) }, 500)
  if (!data) return respond({ success: false, message: 'Forum category not found.' }, 404)
  return respond({ success: true })
}
