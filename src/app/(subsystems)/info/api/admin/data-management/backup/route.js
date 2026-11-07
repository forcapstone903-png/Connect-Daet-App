import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

const BACKUP_FORMAT = 'connect-daet-admin-data'
const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 50 * 1024 * 1024
const PAGE_SIZE = 1000
const WRITE_BATCH_SIZE = 500

const BACKUP_TABLES = [
  'info_users',
  'system_categories',
  'forum_categories',
  'hashtags',
  'profiles',
  'user_activity_log',
  'user_points',
  'user_badges',
  'reward_history',
  'user_feed_preferences',
  'user_favorites',
  'follows',
  'user_follows',
  'user_blocks',
  'info_announcements',
  'info_blogs',
  'info_events',
  'info_tourist_spots',
  'info_user_posts',
  'info_feedback',
  'info_inquiries',
  'info_audit_log',
  'info_moderation',
  'info_notifications',
  'notifications',
  'info_comments',
  'forum_threads',
  'content_reactions',
  'content_comments',
  'mentions',
  'content_hashtags',
  'hashtag_follows',
  'content_shares',
  'reposts',
  'content_polls',
  'poll_votes',
  'attraction_ratings',
  'review_helpfulness',
  'share_analytics',
  'daily_feedback_questions',
  'daily_feedback_votes',
  'event_registrations',
  'user_polls',
  'user_poll_votes',
  'comment_point_rewards',
  'direct_messages',
  'message_conversation_settings',
  'direct_message_reactions',
  'pinned_messages',
  'pinned_message_activity',
  'forum_replies',
  'forum_subscriptions',
]

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

function removeCredentials(table, row) {
  const safeRow = { ...row }
  if (table === 'info_users') delete safeRow.password
  return safeRow
}

async function getTableRows(table, sizeTracker) {
  const rows = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await adminSupabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Unable to back up ${table}: ${error.message}`)

    const page = data || []
    for (const row of page) {
      const safeRow = removeCredentials(table, row)
      sizeTracker.bytes += Buffer.byteLength(JSON.stringify(safeRow), 'utf8')
      if (sizeTracker.bytes > MAX_BACKUP_BYTES) {
        throw new Error('The database snapshot exceeds the 50 MB limit supported by this download workflow.')
      }
      rows.push(safeRow)
    }
    if (page.length < PAGE_SIZE) return rows
  }
}

async function getBackup() {
  const tables = {}
  const sizeTracker = { bytes: 0 }
  for (const table of BACKUP_TABLES) {
    tables[table] = await getTableRows(table, sizeTracker)
  }

  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    restoreMode: 'merge',
    excludedData: ['passwords', 'password-reset records', 'push-subscription credentials', 'page-view telemetry', 'media files', 'server-side maintenance settings'],
    tables,
  }
  const body = JSON.stringify(backup, null, 2)
  if (Buffer.byteLength(body, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error('The database snapshot exceeds the 50 MB limit supported by this download workflow.')
  }

  return body
}

async function validateTables() {
  const failedTables = []

  for (const table of BACKUP_TABLES) {
    const { error } = await adminSupabase.from(table).select('id').limit(1)
    if (error) failedTables.push({ table, message: error.message })
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

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return 'Backup must be a JSON object.'
  }
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION) {
    return 'This backup format or version is not supported.'
  }
  if (!backup.tables || typeof backup.tables !== 'object' || Array.isArray(backup.tables)) {
    return 'Backup is missing its tables object.'
  }

  const unknownTables = Object.keys(backup.tables).filter((table) => !BACKUP_TABLES.includes(table))
  if (unknownTables.length) return `Backup contains unsupported tables: ${unknownTables.join(', ')}.`

  const missingTables = BACKUP_TABLES.filter((table) => !Object.hasOwn(backup.tables, table))
  if (missingTables.length) return `Backup is incomplete; missing tables: ${missingTables.join(', ')}.`

  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table]
    if (!Array.isArray(rows)) return `Backup table "${table}" must contain an array.`

    const ids = new Set()
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id.trim()) {
        return `Backup table "${table}" contains a row without a valid id.`
      }
      if (ids.has(row.id)) return `Backup table "${table}" contains duplicate id "${row.id}".`
      ids.add(row.id)
    }
  }

  return null
}

async function preserveExistingUserPasswords(userRows) {
  const passwordsById = new Map()
  const userIds = userRows.map((row) => row.id)

  for (let offset = 0; offset < userIds.length; offset += WRITE_BATCH_SIZE) {
    const ids = userIds.slice(offset, offset + WRITE_BATCH_SIZE)
    const { data, error } = await adminSupabase
      .from('info_users')
      .select('id, password')
      .in('id', ids)

    if (error) throw new Error(`Unable to preserve existing user passwords: ${error.message}`)
    for (const user of data || []) passwordsById.set(user.id, user.password)
  }

  return userRows.map((row) => ({
    ...removeCredentials('info_users', row),
    password: passwordsById.get(row.id) ?? null,
  }))
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

async function mergeBackup(backup) {
  await preflightTables()

  const records = new Map()
  for (const table of BACKUP_TABLES) {
    let rows = backup.tables[table].map((row) => removeCredentials(table, row))
    if (table === 'info_users') rows = await preserveExistingUserPasswords(rows)
    records.set(table, rows)
  }

  let restoredRows = 0
  let restoredTables = 0

  for (const table of BACKUP_TABLES) {
    const rows = records.get(table)
    for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + WRITE_BATCH_SIZE).map((row) => {
        const firstPassRow = { ...row }
        for (const field of SELF_REFERENCES[table] || []) firstPassRow[field] = null
        return firstPassRow
      })

      const { error } = await adminSupabase.from(table).upsert(batch, { onConflict: 'id' })
      if (error) {
        throw new Error(`Restore partially completed at "${table}" after ${restoredRows} rows: ${error.message}`)
      }
      restoredRows += batch.length
    }
    if (rows.length) restoredTables += 1
  }

  for (const [table, fields] of Object.entries(SELF_REFERENCES)) {
    const rows = records.get(table) || []
    for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + WRITE_BATCH_SIZE)
      const { error } = await adminSupabase.from(table).upsert(batch, { onConflict: 'id' })
      if (error) {
        throw new Error(`Restore merged ${restoredRows} rows but could not restore ${fields.join(', ')} in "${table}": ${error.message}`)
      }
    }
  }

  return { restoredRows, restoredTables }
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
      return jsonResponse({ success: false, message: error.message || 'Unable to validate backup tables.' }, 500)
    }
  }

  try {
    const body = await getBackup()
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
    return jsonResponse({ success: false, message: error.message || 'Unable to create a database snapshot.' }, 500)
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

    const validationError = validateBackup(backup)
    if (validationError) return jsonResponse({ success: false, message: validationError }, 400)

    const result = await mergeBackup(backup)
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    console.error('Admin database restore error:', error)
    return jsonResponse({
      success: false,
      message: error.message || 'Unable to restore the database snapshot.',
    }, 500)
  }
}
