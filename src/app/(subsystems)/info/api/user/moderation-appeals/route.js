import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fileMatchesDeclaredType, safeObjectName } from '@/lib/uploadValidation'
import { getServerSession } from '@/lib/serverAuth'
import { signModerationAppealEvidence } from '@/lib/moderationAppealEvidence.mjs'
import {
  sendAppealAccessEmail,
} from '@/lib/moderatorReviewEmail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EVIDENCE_BUCKET = 'moderation-appeal-evidence'
const MAX_EVIDENCE_FILES = 3
const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024
const ALLOWED_EVIDENCE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

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

function normalizedOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.SITE_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL.trim()}` : '')
    || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '')
  try {
    const url = new URL(configured)
    if (!['https:', 'http:'].includes(url.protocol)) return null
    if (url.protocol === 'http:' && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}

function activeBanQuery(client, userId, banType, now) {
  return client.from('admin_user_bans')
    .select('id, reason, expires_at, banned_at, ban_type')
    .eq('user_id', userId)
    .eq('ban_type', banType)
    .is('lifted_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('banned_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

async function removeAppealEvidence(client, userId, paths) {
  if (!paths.length) return
  const { error: storageError } = await client.storage.from(EVIDENCE_BUCKET).remove(paths)
  if (storageError) {
    console.error('Appeal evidence cleanup failed:', { code: storageError.code || null })
    return
  }
  const { error: trackingError } = await client
    .from('user_storage_objects')
    .delete()
    .eq('user_id', userId)
    .eq('bucket_id', EVIDENCE_BUCKET)
    .in('object_path', paths)
  if (trackingError) {
    console.error('Appeal evidence ownership cleanup failed:', { code: trackingError.code || null })
  }
}

async function uploadAppealEvidence(client, userId, appealId, files) {
  const paths = []
  try {
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      if (!fileMatchesDeclaredType(buffer, file.type)) {
        throw new Error('An evidence file does not match its declared type.')
      }

      const objectPath = `${userId}/${appealId}/${safeObjectName(file.name, file.type)}`
      const { data, error } = await client.storage
        .from(EVIDENCE_BUCKET)
        .upload(objectPath, new Blob([buffer], { type: file.type }), {
          contentType: file.type,
          upsert: false,
        })
      if (error) throw error

      const storedPath = data?.path || objectPath
      paths.push(storedPath)
      const { error: trackingError } = await client
        .from('user_storage_objects')
        .insert({
          user_id: userId,
          bucket_id: EVIDENCE_BUCKET,
          object_path: storedPath,
          file_size: file.size,
          content_type: file.type,
        })
      if (trackingError) throw trackingError
    }
    return paths
  } catch (error) {
    await removeAppealEvidence(client, userId, paths)
    throw error
  }
}

function parseUuid(value) {
  const normalized = String(value || '').trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

async function requestBannedAppealAccess(client, body) {
  const restrictionId = parseUuid(body?.caseReference)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const origin = normalizedOrigin()
  const fingerprintSecret = process.env.CRON_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (restrictionId && email && email.length <= 320 && origin && fingerprintSecret) {
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const requestFingerprint = createHmac('sha256', fingerprintSecret)
      .update(`${restrictionId}:${email.toLowerCase()}`)
      .digest('hex')
    const { data, error } = await client.rpc('create_banned_account_appeal_access_request', {
      p_restriction_id: restrictionId,
      p_email: email,
      p_request_fingerprint: requestFingerprint,
      p_token_hash: tokenHash,
      p_token_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    if (error) throw error

    if (data?.accepted && data.email) {
      try {
        const result = await sendAppealAccessEmail(data.email, {
          appealUrl: `${origin}/info/account-appeal#token=${encodeURIComponent(token)}&caseReference=${encodeURIComponent(restrictionId)}`,
          caseReference: restrictionId,
        })
        if (!result.sent) {
          console.error('Banned-user appeal access email was not sent:', {
            reason: result.reason || 'unknown',
          })
        }
      } catch (emailError) {
        console.error('Banned-user appeal access email failed:', { code: emailError.code || null })
      }
    }
  }

  return respond({
    success: true,
    message: 'If the case reference and registered email match, a secure appeal link will be sent shortly.',
  })
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'Please log in to view moderation appeals.' }, 401)

  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation appeals are not configured.' }, 500)

  try {
    const now = new Date().toISOString()
    const [accountResult, suspensionResult, permanentBanResult, postingRestrictionResult, appealResult] = await Promise.all([
      client.from('info_users')
        .select('status, account_deactivated_at')
        .eq('id', userId)
        .maybeSingle(),
      activeBanQuery(client, userId, 'suspension', now),
      activeBanQuery(client, userId, 'permanent', now),
      activeBanQuery(client, userId, 'posting', now),
      client.from('user_moderation_appeals')
        .select('id, restriction_id, reason, explanation, appeal_type, evidence_paths, status, decision_notes, reviewed_at, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    for (const result of [accountResult, suspensionResult, permanentBanResult, postingRestrictionResult, appealResult]) {
      if (result.error) throw result.error
    }

    const account = accountResult.data
    const accountSuspension = account?.status === 'suspended'
      && !account.account_deactivated_at
      ? suspensionResult.data
      : null
    const permanentBan = account?.status === 'banned'
      && !account.account_deactivated_at
      ? permanentBanResult.data
      : null
    const restriction = account?.status === 'active'
      && !account.account_deactivated_at
      ? postingRestrictionResult.data
      : null
    const appeals = await signModerationAppealEvidence(client, appealResult.data || [])

    return respond({
      success: true,
      accountStatus: account?.status || null,
      restriction: restriction || null,
      accountSuspension: accountSuspension || null,
      permanentBan: permanentBan || null,
      appeals,
    })
  } catch (error) {
    console.error('User moderation appeals load failed:', { code: error.code || null })
    return respond({ success: false, message: 'Unable to load your moderation appeal information.' }, 500)
  }
}

export async function POST(request) {
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'Moderation appeals are not configured.' }, 500)

  try {
    if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
      let body
      try {
        body = await request.json()
      } catch {
        return respond({ success: false, message: 'A valid appeal request is required.' }, 400)
      }
      if (body?.action === 'request-access') return await requestBannedAppealAccess(client, body)
      return respond({ success: false, message: 'A valid appeal submission is required.' }, 400)
    }

    const formData = await request.formData()
    const body = {
      caseReference: formData.get('caseReference'),
      reason: formData.get('reason'),
      explanation: formData.get('explanation'),
      token: formData.get('token'),
      appealId: formData.get('appealId'),
    }
    const evidenceEntries = formData.getAll('evidence')
    if (evidenceEntries.some((entry) => typeof entry === 'string')) {
      return respond({ success: false, message: 'Evidence must be uploaded as files.' }, 400)
    }
    const files = evidenceEntries.filter((entry) => entry && entry.size > 0)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const explanation = typeof body.explanation === 'string' ? body.explanation.trim() : ''
    const hasAccessToken = typeof body.token === 'string' && body.token.trim().length > 0
    if ((!reason && !hasAccessToken) || reason.length > 2000 || !explanation || explanation.length > 5000) {
      return respond({ success: false, message: 'Provide an appeal reason (up to 2,000 characters) and explanation (up to 5,000 characters).' }, 400)
    }
    if (files.length > MAX_EVIDENCE_FILES) {
      return respond({ success: false, message: 'Attach no more than three evidence files.' }, 400)
    }
    if (files.some((file) => !ALLOWED_EVIDENCE_TYPES.has(file.type) || file.size > MAX_EVIDENCE_BYTES)
      || files.reduce((total, file) => total + file.size, 0) > MAX_EVIDENCE_BYTES) {
      return respond({ success: false, message: 'Evidence must be supported image or video files totaling no more than 20 MB.' }, 400)
    }
    for (const file of files) {
      if (!fileMatchesDeclaredType(await file.arrayBuffer(), file.type)) {
        return respond({ success: false, message: 'An evidence file does not match its declared type.' }, 400)
      }
    }

    const sessionUserId = getServerSession(request)?.user_id || null
    const accessToken = typeof body.token === 'string' ? body.token.trim() : ''
    let access = null
    let accessTokenHash = null
    if (accessToken) {
      if (!/^[a-f0-9]{64}$/i.test(accessToken)) {
        return respond({ success: false, message: 'This secure appeal link is invalid or has expired.' }, 400)
      }
      accessTokenHash = createHash('sha256').update(accessToken).digest('hex')
      const { data, error } = await client.from('account_appeal_access_requests')
        .select('user_id, restriction_id, appeal_id, expires_at, consumed_at')
        .eq('token_hash', accessTokenHash)
        .maybeSingle()
      if (error) throw error
      if (!data || data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) {
        return respond({ success: false, message: 'This secure appeal link is invalid, expired, or already used.' }, 400)
      }
      access = data
    }
    if (!sessionUserId && !access) {
      return respond({ success: false, message: 'Sign in or use a secure appeal link to submit your appeal.' }, 401)
    }

    const userId = access?.user_id || sessionUserId
    const caseReference = parseUuid(body.caseReference)
    const restrictionId = access?.restriction_id || caseReference
    if (!restrictionId) return respond({ success: false, message: 'Enter a valid case reference number.' }, 400)

    let restriction
    let appealType
    let appealId = access?.appeal_id || parseUuid(body.appealId) || randomUUID()

    if (access) {
      const { data: existingAppeal, error: existingAppealError } = access.appeal_id
        ? await client.from('user_moderation_appeals')
          .select('reason, appeal_type')
          .eq('id', access.appeal_id)
          .eq('user_id', userId)
          .maybeSingle()
        : { data: null, error: null }
      if (existingAppealError) throw existingAppealError
      appealType = existingAppeal?.appeal_type || 'permanent_ban'
      restriction = { id: access.restriction_id }
      if (!reason && existingAppeal?.reason) body.reason = existingAppeal.reason
    } else {
      const [accountResult, suspensionResult, permanentBanResult, postingRestrictionResult] = await Promise.all([
        client.from('info_users')
          .select('status, account_deactivated_at')
          .eq('id', userId)
          .maybeSingle(),
        activeBanQuery(client, userId, 'suspension', new Date().toISOString()),
        activeBanQuery(client, userId, 'permanent', new Date().toISOString()),
        activeBanQuery(client, userId, 'posting', new Date().toISOString()),
      ])
      for (const result of [accountResult, suspensionResult, permanentBanResult, postingRestrictionResult]) {
        if (result.error) throw result.error
      }
      const account = accountResult.data
      if (!account || account.account_deactivated_at) {
        return respond({ success: false, message: 'This account is not eligible to submit an appeal.' }, 409)
      }
      if (account.status === 'suspended' && suspensionResult.data) {
        restriction = suspensionResult.data
        appealType = 'account_suspension'
      } else if (account.status === 'banned' && permanentBanResult.data) {
        restriction = permanentBanResult.data
        appealType = 'permanent_ban'
      } else if (account.status === 'active' && postingRestrictionResult.data) {
        restriction = postingRestrictionResult.data
        appealType = 'posting_restriction'
      } else {
        return respond({ success: false, message: 'There is no active account restriction to appeal.' }, 409)
      }
      if (restriction.id !== restrictionId) {
        return respond({ success: false, message: 'The case reference does not match your current restriction.' }, 409)
      }
    }

    const evidencePaths = await uploadAppealEvidence(client, userId, appealId, files)
    const { data: appeal, error } = await client.rpc('submit_user_moderation_appeal_v2', {
      p_user_id: userId,
      p_appeal_id: appealId,
      p_restriction_id: restriction.id,
      p_reason: String(body.reason || '').trim(),
      p_explanation: explanation,
      p_appeal_type: appealType,
      p_evidence_paths: evidencePaths,
      p_access_token_hash: accessTokenHash,
    })

    if (error) {
      await removeAppealEvidence(client, userId, evidencePaths)
      if (error.code === '23505') {
        return respond({ success: false, message: 'You already have an open appeal for this restriction.' }, 409)
      }
      if (error.message?.includes('not eligible') || error.message?.includes('no active')) {
        return respond({ success: false, message: 'Your account restriction changed. Reload to check appeal eligibility.' }, 409)
      }
      if (error.message?.includes('secure appeal access')) {
        return respond({ success: false, message: 'This secure appeal link is invalid, expired, or already used.' }, 400)
      }
      if (error.message?.includes('No more than three evidence files')
        || error.message?.includes('does not match the appeal type')) {
        return respond({ success: false, message: error.message }, 400)
      }
      throw error
    }

    return respond({ success: true, appeal }, 201)
  } catch (error) {
    console.error('User moderation appeal submission failed:', {
      code: error.code || null,
    })
    return respond({ success: false, message: 'Unable to submit your appeal right now.' }, 500)
  }
}
