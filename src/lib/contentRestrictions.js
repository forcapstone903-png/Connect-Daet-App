const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

// Any active restriction (posting ban or suspension) blocks publishing.
export async function getActivePublishingRestriction(client, userId) {
  const { data, error } = await client
    .from('admin_user_bans')
    .select('reason, expires_at')
    .eq('user_id', userId)
    .is('lifted_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle()
  if (error) throw error
  return data || null
}

export async function getActiveCommentRestriction(client, userId) {
  const [publishingRestriction, muteResult] = await Promise.all([
    getActivePublishingRestriction(client, userId),
    client
      .from('admin_comment_mutes')
      .select('reason, expires_at')
      .eq('user_id', userId)
      .is('lifted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle(),
  ])
  if (muteResult.error) throw muteResult.error
  return publishingRestriction || muteResult.data || null
}

// Only a 'suspension' blocks signing in. Before migration 102 every ban is a
// posting ban, so a missing ban_type column means "no suspension".
export async function getActiveSuspension(client, userId) {
  const { data, error } = await client
    .from('admin_user_bans')
    .select('reason, expires_at, ban_type')
    .eq('user_id', userId)
    .eq('ban_type', 'suspension')
    .is('lifted_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle()
  if (error) {
    if (MISSING_COLUMN_CODES.has(error.code)) return null
    throw error
  }
  return data || null
}

export function describeSuspension(suspension) {
  const until = suspension?.expires_at
    ? ` until ${new Date(suspension.expires_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}`
    : ''
  return `This account is suspended${until} for violating the community guidelines. You can submit an appeal after the suspension ends, or contact the tourism office.`
}
