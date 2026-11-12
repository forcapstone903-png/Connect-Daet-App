// Fallback scheduler for alerts. The primary scheduler is pg_cron
// (job "deliver-due-alerts", every minute, migration 098). Call this from an
// external scheduler only if pg_cron is unavailable:
//   GET /info/api/cron/alerts   Authorization: Bearer $CRON_SECRET
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET?.trim() || ''
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  return Buffer.byteLength(expected) >= 32
    && Buffer.byteLength(provided) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

const respond = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })

export async function GET(request) {
  if (!isAuthorized(request)) return respond({ success: false, message: 'Unauthorized.' }, 401)
  const client = getServiceClient()
  if (!client) return respond({ success: false, message: 'Server is not configured.' }, 500)

  const { data, error } = await client.rpc('deliver_due_alerts')
  if (error) {
    console.error('Scheduled alert delivery failed:', error)
    return respond({ success: false, message: 'Scheduled alert delivery failed.' }, 500)
  }
  return respond({ success: true, delivered: Number(data) || 0 })
}
