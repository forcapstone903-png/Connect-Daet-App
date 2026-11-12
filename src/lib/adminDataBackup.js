export const BACKUP_FORMAT = 'connect-daet-admin-data'
export const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 50 * 1024 * 1024
const PAGE_SIZE = 1000

export const BACKUP_TABLES = [
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

export function removeCredentials(table, row) {
  const safeRow = { ...row }
  if (table === 'info_users') delete safeRow.password
  return safeRow
}

export function validateAdminDataBackup(backup) {
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

export async function createAdminDataBackup(adminSupabase, { includeMedia = false } = {}) {
  const tables = {}
  let bytes = 0

  for (const table of BACKUP_TABLES) {
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
        bytes += Buffer.byteLength(JSON.stringify(safeRow), 'utf8')
        if (bytes > MAX_BACKUP_BYTES) {
          throw new Error('The database snapshot exceeds the 50 MB limit supported by this workflow.')
        }
        rows.push(safeRow)
      }
      if (page.length < PAGE_SIZE) break
    }
    tables[table] = rows
  }

  const backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    restoreMode: 'merge',
    mediaIncluded: includeMedia,
    excludedData: [
      'passwords',
      'password-reset records',
      'push-subscription credentials',
      'page-view telemetry',
      ...(!includeMedia ? ['media files'] : []),
      'server-side maintenance settings',
    ],
    tables,
  }
  const body = JSON.stringify(backup, null, 2)
  if (Buffer.byteLength(body, 'utf8') > MAX_BACKUP_BYTES) {
    throw new Error('The database snapshot exceeds the 50 MB limit supported by this workflow.')
  }

  return body
}
