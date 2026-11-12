import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { publicErrorMessage } from '@/lib/publicError'
import {
  BACKUP_TABLES,
  createAdminDataBackup,
  removeCredentials,
  validateAdminDataBackup,
} from '@/lib/adminDataBackup'
const MAX_BACKUP_BYTES = 50 * 1024 * 1024

function restoreError(message, restoredRows, restoredTables) {
  const error = new Error(message)
  error.restoredRows = restoredRows
  error.restoredTables = restoredTables
  return error
}

const SELF_REFERENCES = {
  info_comments: ['parent_id'],
  content_comments: ['parent_id'],
  direct_messages: ['reply_to_message_id'],
  forum_replies: ['parent_reply_id'],
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null

export const dynamic = 'force-dynamic'

function jsonResponse(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function missingConfig() {
  return jsonResponse({
    success: false,
    message: 'Server is not configured for database backups.',
  }, 500)
}

async function validateTables() {
  const failedTables = []

  for (const table of BACKUP_TABLES) {
    const { error } = await adminSupabase.from(table).select('id').limit(1)
    if (error) failedTables.push({ table, message: publicErrorMessage(error) })
  }

  if (failedTables.length) {
    return jsonResponse({
      success: false,
      message: `${failedTables.length} backup table(s) are unavailable.`,
      failedTables: failedTables.map((item) => item.table),
      errors: failedTables,
    }, 503)
  }

  return jsonResponse({ success: true, tablesChecked: BACKUP_TABLES.length })
}

async function preflightTables() {
  for (const table of BACKUP_TABLES) {
    const { error } = await adminSupabase.from(table).select('id').limit(0)
    if (error) throw new Error(`Restore was not started because table "${table}" is unavailable: ${error.message}`)
  }
}

async function readRequestBody(request) {
  const reader = request.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()

    bytes += value.byteLength
    if (bytes > MAX_BACKUP_BYTES) {
      await reader.cancel()
      return null
    }

    text += decoder.decode(value, { stream: true })
  }
}

// Restore runs inside one database function (migration 102), so the whole
// snapshot is applied in a single transaction: if any row fails, nothing is
// written. Rows are merged by id and nothing missing from the snapshot is
// deleted. Stored passwords are never written (the column is skipped).
async function mergeBackup(backup) {
  await preflightTables()

  const tables = {}
  for (const table of BACKUP_TABLES) {
    tables[table] = backup.tables[table].map((row) => removeCredentials(table, row))
  }

  const { data, error } = await adminSupabase.rpc('admin_restore_backup', {
    p_tables: tables,
    p_table_order: BACKUP_TABLES,
    p_self_refs: SELF_REFERENCES,
  })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) {
      throw restoreError('Restore needs database migration 102 (admin_restore_backup). Nothing was changed.', 0, 0)
    }
    throw restoreError(`Restore failed and was rolled back; nothing was changed. ${error.message}`, 0, 0)
  }
  return {
    restoredRows: Number(data?.restoredRows) || 0,
    restoredTables: Number(data?.restoredTables) || 0,
    transactional: true,
  }
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  if (new URL(request.url).searchParams.get('validate') === '1') {
    try {
      return await validateTables()
    } catch (error) {
      console.error('Admin backup validation error:', error)
      return jsonResponse({ success: false, message: publicErrorMessage(error, 'Unable to validate backup tables.') }, 500)
    }
  }

  try {
    const body = await createAdminDataBackup(adminSupabase)
    const filename = `connect-daet-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Admin database backup error:', error)
    return jsonResponse({ success: false, message: publicErrorMessage(error, 'Unable to create a database snapshot.') }, 500)
  }
}

export async function POST(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > MAX_BACKUP_BYTES) {
    return jsonResponse({ success: false, message: 'Backup files must be 50 MB or smaller.' }, 413)
  }

  try {
    const body = await readRequestBody(request)
    if (body === null) {
      return jsonResponse({ success: false, message: 'Backup files must be 50 MB or smaller.' }, 413)
    }

    let backup
    try {
      backup = JSON.parse(body)
    } catch {
      return jsonResponse({ success: false, message: 'The selected file is not valid JSON.' }, 400)
    }

    const validationError = validateAdminDataBackup(backup)
    if (validationError) return jsonResponse({ success: false, message: validationError }, 400)

    const result = await mergeBackup(backup)
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    console.error('Admin database restore error:', error)
    return jsonResponse({
      success: false,
      message: publicErrorMessage(error, 'Unable to restore the database snapshot.'),
      partialRestore: false,
    }, 500)
  }
}
