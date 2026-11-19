import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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

async function validateBlogSubmission(client, blogId) {
  const { data, error } = await client
    .from('info_blogs')
    .select('id, approval_status')
    .eq('id', blogId)
    .maybeSingle()
  if (error) throw error
  return data?.approval_status === 'pending'
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation claims are not configured.' }, 500)

  const { data, error } = await client
    .from('admin_moderation_claims')
    .select('entity_type, entity_id, claimed_by, claimed_at, expires_at')
    .eq('entity_type', 'blog')
    .gt('expires_at', new Date().toISOString())
    .order('claimed_at', { ascending: true })
  if (error) {
    console.error('Moderation claim list failed:', error)
    return respond({ success: false, message: 'Unable to load current moderation assignments.' }, 500)
  }
  return respond({ success: true, claims: data || [] })
}

export async function POST(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation claims are not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A moderation submission is required.' }, 400)
  }
  const entityType = String(body?.entityType || '')
  const entityId = String(body?.entityId || '')
  if (entityType !== 'blog' || !isValidUuid(entityId)) {
    return respond({ success: false, message: 'A valid blog submission is required.' }, 400)
  }

  try {
    if (!await validateBlogSubmission(client, entityId)) {
      return respond({ success: false, message: 'This post is no longer pending review.' }, 409)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
    const { error: expiredClaimsError } = await client
      .from('admin_moderation_claims')
      .delete()
      .lte('expires_at', now.toISOString())
    if (expiredClaimsError) throw expiredClaimsError

    const claim = {
      entity_type: entityType,
      entity_id: entityId,
      claimed_by: authorization.session.user_id,
      claimed_at: now.toISOString(),
      expires_at: expiresAt,
    }
    const { data, error } = await client
      .from('admin_moderation_claims')
      .insert(claim)
      .select('entity_type, entity_id, claimed_by, claimed_at, expires_at')
      .maybeSingle()
    if (!error) return respond({ success: true, claim: data })
    if (error.code !== '23505') throw error

    const { data: current, error: currentError } = await client
      .from('admin_moderation_claims')
      .select('entity_type, entity_id, claimed_by, claimed_at, expires_at')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle()
    if (currentError) throw currentError
    if (!current) return respond({ success: false, message: 'This post could not be claimed. Refresh and retry.' }, 409)
    if (current.claimed_by !== authorization.session.user_id) {
      return respond({ success: false, message: 'Another moderator is currently reviewing this post.' }, 409)
    }

    const { data: renewed, error: renewError } = await client
      .from('admin_moderation_claims')
      .update({ claimed_at: now.toISOString(), expires_at: expiresAt })
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .eq('claimed_by', authorization.session.user_id)
      .select('entity_type, entity_id, claimed_by, claimed_at, expires_at')
      .maybeSingle()
    if (renewError) throw renewError
    return respond({ success: true, claim: renewed })
  } catch (error) {
    console.error('Moderation claim failed:', error)
    return respond({ success: false, message: 'Unable to claim this post for review.' }, 500)
  }
}

export async function DELETE(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation claims are not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const entityType = params.get('entityType') || ''
  const entityId = params.get('entityId') || ''
  if (entityType !== 'blog' || !isValidUuid(entityId)) {
    return respond({ success: false, message: 'A valid blog submission is required.' }, 400)
  }

  const { error } = await client
    .from('admin_moderation_claims')
    .delete()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('claimed_by', authorization.session.user_id)
  if (error) {
    console.error('Moderation claim release failed:', error)
    return respond({ success: false, message: 'Unable to release this moderation claim.' }, 500)
  }
  return respond({ success: true })
}