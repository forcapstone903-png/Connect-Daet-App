import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { notifyContentAuthorOfDeletion } from '@/lib/contentDeletionNotifications.mjs'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

export async function DELETE(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  const client = getAdminClient()
  if (!client) return respond({ success: false, message: 'User-content moderation is not configured.' }, 500)

  let body
  try {
    body = await request.json()
  } catch {
    return respond({ success: false, message: 'A valid content deletion request is required.' }, 400)
  }

  const contentType = body?.contentType
  const contentId = String(body?.contentId || '')
  const userId = String(body?.userId || '')
  if (!['post', 'comment'].includes(contentType) || !isValidUuid(contentId) || !isValidUuid(userId)) {
    return respond({ success: false, message: 'Choose a valid user post or comment.' }, 400)
  }

  try {
    const table = contentType === 'post' ? 'info_user_posts' : 'content_comments'
    const contentColumn = contentType === 'post' ? 'title' : 'body'
    const { data: deleted, error } = await client.from(table)
      .delete()
      .eq('id', contentId)
      .eq('user_id', userId)
      .select(`id, user_id, ${contentColumn}`)
      .maybeSingle()
    if (error) throw error
    if (!deleted) return respond({ success: false, message: 'The selected content was not found for this user.' }, 404)

    const { error: auditError } = await client.from('info_audit_log').insert({
      user_id: authorization.session.user_id,
      action: `admin_deleted_user_${contentType}`,
      table_name: table,
      record_id: deleted.id,
      changes: { contentAuthorId: deleted.user_id },
    })
    if (auditError) console.error('User-content deletion audit failed:', auditError)

    const notification = await notifyContentAuthorOfDeletion(client, {
      authorId: deleted.user_id,
      actorId: authorization.session.user_id,
      contentType: contentType === 'post' ? 'community post' : 'comment',
      contentTitle: deleted[contentColumn],
    })

    return respond({
      success: true,
      notificationSent: notification.sent,
      notificationWarning: notification.warning,
      auditWarning: auditError ? 'The content was deleted, but the moderation log could not be updated.' : null,
    })
  } catch (error) {
    console.error('User-content deletion failed:', error)
    return respond({ success: false, message: 'Unable to delete the selected content.' }, 500)
  }
}
