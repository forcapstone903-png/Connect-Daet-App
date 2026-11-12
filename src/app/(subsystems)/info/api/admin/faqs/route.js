import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getSettingsClient } from '@/lib/appSettingsServer'
import { validateFaqPayload } from '@/lib/faqValidation.mjs'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const FIELDS = 'id, question, answer, sort_order, is_published, created_at, updated_at'
const respond = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

function hasAllowedOrigin(request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

async function readJson(request) {
  try {
    return { body: await request.json() }
  } catch {
    return { error: respond({ success: false, message: 'A valid JSON request body is required.' }, 400) }
  }
}

function isDuplicateQuestion(error) {
  return error?.code === '23505'
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'FAQ management is not configured on the server.' }, 500)

  const { data, error } = await client
    .from('info_faqs')
    .select(FIELDS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('Admin FAQ list failed:', error)
    return respond({ success: false, message: 'Unable to load FAQs.' }, 500)
  }
  return respond({ success: true, items: data || [] })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!hasAllowedOrigin(request)) return respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403)

  const { body, error: bodyError } = await readJson(request)
  if (bodyError) return bodyError
  const parsed = validateFaqPayload(body)
  if (!parsed.ok) return respond({ success: false, message: parsed.message }, 400)

  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'FAQ management is not configured on the server.' }, 500)

  const { data, error } = await client
    .from('info_faqs')
    .insert({ ...parsed.value, created_by: session.user_id, updated_by: session.user_id })
    .select(FIELDS)
    .single()

  if (error) {
    if (isDuplicateQuestion(error)) return respond({ success: false, message: 'An FAQ with that question already exists.' }, 409)
    console.error('FAQ creation failed:', error)
    return respond({ success: false, message: 'Unable to create this FAQ.' }, 500)
  }

  revalidateTag('published-faqs', { expire: 0 })
  return respond({ success: true, item: data }, 201)
}

export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!hasAllowedOrigin(request)) return respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403)

  const { body, error: bodyError } = await readJson(request)
  if (bodyError) return bodyError
  if (!isValidUuid(body?.id)) return respond({ success: false, message: 'A valid FAQ is required.' }, 400)

  const parsed = validateFaqPayload(body)
  if (!parsed.ok) return respond({ success: false, message: parsed.message }, 400)

  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'FAQ management is not configured on the server.' }, 500)

  const { data, error } = await client
    .from('info_faqs')
    .update({ ...parsed.value, updated_by: session.user_id })
    .eq('id', body.id)
    .select(FIELDS)
    .maybeSingle()

  if (error) {
    if (isDuplicateQuestion(error)) return respond({ success: false, message: 'An FAQ with that question already exists.' }, 409)
    console.error('FAQ update failed:', error)
    return respond({ success: false, message: 'Unable to update this FAQ.' }, 500)
  }
  if (!data) return respond({ success: false, message: 'FAQ not found.' }, 404)

  revalidateTag('published-faqs', { expire: 0 })
  return respond({ success: true, item: data })
}

export async function DELETE(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!hasAllowedOrigin(request)) return respond({ success: false, message: 'Cross-origin requests are not allowed.' }, 403)

  const { body, error: bodyError } = await readJson(request)
  if (bodyError) return bodyError
  if (!isValidUuid(body?.id)) return respond({ success: false, message: 'A valid FAQ is required.' }, 400)

  const client = getSettingsClient()
  if (!client) return respond({ success: false, message: 'FAQ management is not configured on the server.' }, 500)

  const { data, error } = await client
    .from('info_faqs')
    .delete()
    .eq('id', body.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('FAQ deletion failed:', error)
    return respond({ success: false, message: 'Unable to delete this FAQ.' }, 500)
  }
  if (!data) return respond({ success: false, message: 'FAQ not found.' }, 404)

  revalidateTag('published-faqs', { expire: 0 })
  return respond({ success: true })
}
