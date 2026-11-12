import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { pruneScheduledBackups, runAdminBackup } from '@/lib/adminBackupService'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET?.trim() || ''
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  return Buffer.byteLength(expected) >= 32
    && Buffer.byteLength(provided) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  if (!isAuthorized(request)) return response({ success: false, message: 'Unauthorized.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Scheduled backup job is not configured.')
    return response({ success: false, message: 'Scheduled backup job is not configured.' }, 503)
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const now = new Date()
    if (now.getUTCDay() !== 0) {
      await pruneScheduledBackups(adminSupabase)
      return response({ success: true, retentionCleanup: true })
    }

    const scheduledFor = now.toISOString().slice(0, 10)
    const result = await runAdminBackup(adminSupabase, {
      triggerType: 'scheduled',
      scheduledFor,
    })
    return response({ success: true, ...result })
  } catch (error) {
    console.error('Scheduled backup failed:', error)
    return response({ success: false, message: publicErrorMessage(error, 'Scheduled backup failed.') }, 500)
  }
}
