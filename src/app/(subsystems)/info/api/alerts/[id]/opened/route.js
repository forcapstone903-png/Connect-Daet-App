// Marks the signed-in user's inbox copy of an alert as read when they open the
// alert page (e.g. by tapping the push notification), so "reach" counts
// opens from push as well as from the inbox. Guests are not tracked.
import { getServerSession } from '@/lib/serverAuth'
import { UUID_PATTERN, fail, getServiceClient, json, missingConfig } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request, { params }) {
  const session = getServerSession(request)
  if (!session?.user_id) return json({ success: true, tracked: false })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return fail(403, 'Cross-origin requests are not allowed.')

  const { id } = await params
  if (!UUID_PATTERN.test(String(id))) return fail(400, 'Invalid alert ID.')
  const client = getServiceClient()
  if (!client) return missingConfig()

  const { error } = await client
    .from('info_notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('user_id', session.user_id)
    .eq('alert_id', id)
    .eq('is_read', false)
  if (error) {
    console.error('Alert open tracking failed:', { code: error.code })
    return fail(500, 'Unable to record the alert as read.')
  }
  return json({ success: true, tracked: true })
}
