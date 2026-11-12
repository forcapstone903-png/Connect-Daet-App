import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { ADMIN_BACKUP_BUCKET, runAdminBackup } from '@/lib/adminBackupService'
import { publicErrorMessage } from '@/lib/publicError'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function unavailable() {
  return response({
    success: false,
    message: 'Automated backups are not configured. Apply migration 095 and configure the server Supabase credentials.',
  }, 503)
}

async function loadSettings() {
  const { data, error } = await adminSupabase
    .from('admin_backup_settings')
    .select('enabled, retention_days, include_media, updated_at')
    .eq('id', 1)
    .single()
  if (error || !data) throw new Error('Backup settings are unavailable. Apply migration 095 before configuring backups.')
  return data
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return unavailable()

  try {
    const downloadId = new URL(request.url).searchParams.get('download')
    if (downloadId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(downloadId)) {
        return response({ success: false, message: 'A valid backup run ID is required.' }, 400)
      }

      const { data: run, error: runError } = await adminSupabase
        .from('admin_backup_runs')
        .select('storage_path, status, started_at')
        .eq('id', downloadId)
        .maybeSingle()
      if (runError) throw runError
      if (!run || run.status !== 'succeeded') {
        return response({ success: false, message: 'The requested backup snapshot is unavailable.' }, 404)
      }

      const { data: snapshot, error: downloadError } = await adminSupabase.storage
        .from(ADMIN_BACKUP_BUCKET)
        .download(`${run.storage_path}/database.json`)
      if (downloadError || !snapshot) {
        throw new Error(`Unable to download the database snapshot: ${downloadError?.message || 'No file returned.'}`)
      }

      const date = new Date(run.started_at).toISOString().slice(0, 10)
      return new Response(Buffer.from(await snapshot.arrayBuffer()), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="connect-daet-backup-${date}.json"`,
          'Cache-Control': 'private, no-store, max-age=0',
        },
      })
    }

    const [settings, runsResult, bucketResult] = await Promise.all([
      loadSettings(),
      adminSupabase
        .from('admin_backup_runs')
        .select('id, trigger_type, scheduled_for, status, storage_path, media_object_count, total_bytes, error_message, started_at, completed_at')
        .order('started_at', { ascending: false })
        .limit(10),
      adminSupabase.storage.getBucket(ADMIN_BACKUP_BUCKET),
    ])
    if (runsResult.error) throw runsResult.error

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setUTCHours(1, 0, 0, 0)
    const daysUntilSunday = (7 - now.getUTCDay()) % 7
    nextRun.setUTCDate(now.getUTCDate() + daysUntilSunday)
    if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 7)

    return response({
      success: true,
      settings: {
        enabled: settings.enabled,
        retentionDays: settings.retention_days,
        includeMedia: settings.include_media,
        updatedAt: settings.updated_at,
      },
      schedule: 'Weekly on Sunday at 01:00 UTC',
      nextRunAt: nextRun.toISOString(),
      storageReady: !bucketResult.error && bucketResult.data?.public === false,
      runs: runsResult.data || [],
    })
  } catch (error) {
    console.error('Admin backup settings read failed:', error)
    return response({ success: false, message: publicErrorMessage(error, 'Unable to load backup settings.') }, 500)
  }
}

export async function PUT(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return unavailable()

  let body
  try {
    body = await request.json()
  } catch {
    return response({ success: false, message: 'A valid JSON request body is required.' }, 400)
  }

  if (typeof body?.enabled !== 'boolean'
    || !Number.isInteger(body.retentionDays)
    || body.retentionDays < 1
    || body.retentionDays > 365
    || typeof body.includeMedia !== 'boolean') {
    return response({ success: false, message: 'Provide an enabled flag, a retention period from 1 to 365 days, and a media inclusion flag.' }, 400)
  }

  const { data, error } = await adminSupabase
    .from('admin_backup_settings')
    .upsert({
      id: 1,
      enabled: body.enabled,
      retention_days: body.retentionDays,
      include_media: body.includeMedia,
      updated_by: session.user_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('enabled, retention_days, include_media, updated_at')
    .single()

  if (error) {
    console.error('Admin backup settings write failed:', error)
    return response({ success: false, message: 'Unable to save backup settings.' }, 500)
  }

  return response({
    success: true,
    settings: {
      enabled: data.enabled,
      retentionDays: data.retention_days,
      includeMedia: data.include_media,
      updatedAt: data.updated_at,
    },
  })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return unavailable()

  try {
    const result = await runAdminBackup(adminSupabase, { createdBy: session.user_id })
    if (result.alreadyRunning) {
      return response({ success: false, message: 'Another backup is already running. Wait for it to finish before starting another.' }, 409)
    }
    if (result.run?.status === 'failed') {
      return response({ success: false, message: 'The existing scheduled backup failed. Review its run history before starting another manual run.' }, 409)
    }
    return response({ success: true, ...result })
  } catch (error) {
    console.error('Admin manual backup failed:', error)
    return response({ success: false, message: publicErrorMessage(error, 'Unable to create a scheduled backup.') }, 500)
  }
}
