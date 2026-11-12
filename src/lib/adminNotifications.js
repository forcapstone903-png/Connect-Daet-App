async function notifyStaffWithRoles(db, roles, { title, message, type = 'info', link, actorId }) {
  try {
    const { data: staff, error: staffError } = await db
      .from('info_users')
      .select('id')
      .in('user_type', roles)
      .eq('status', 'active')

    if (staffError) throw staffError
    const staffIds = [...new Set((staff || []).map(({ id }) => id).filter(Boolean))]
    if (!staffIds.length) return 0

    const timestamp = new Date().toISOString()
    const { error: notificationError } = await db.from('info_notifications').insert(
      staffIds.map((userId) => ({
        user_id: userId,
        title,
        message,
        type,
        link,
        actor_id: actorId || null,
        is_read: false,
        created_at: timestamp,
        updated_at: timestamp,
      }))
    )

    if (notificationError) throw notificationError
    return staffIds.length
  } catch (error) {
    console.error('Staff notification delivery failed:', error)
    return 0
  }
}

export function notifyAdministrators(db, notification) {
  return notifyStaffWithRoles(db, ['admin', 'administrator'], notification)
}

export function notifyModerators(db, notification) {
  return notifyStaffWithRoles(db, ['moderator'], { ...notification, type: 'moderation' })
}
