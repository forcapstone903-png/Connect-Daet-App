export async function notifyAdministrators(db, { title, message, type = 'info', link }) {
  try {
    const { data: administrators, error: administratorError } = await db
      .from('info_users')
      .select('id')
      .in('user_type', ['admin', 'administrator'])
      .eq('status', 'active')

    if (administratorError) throw administratorError
    const administratorIds = [...new Set((administrators || []).map(({ id }) => id).filter(Boolean))]
    if (!administratorIds.length) return 0

    const timestamp = new Date().toISOString()
    const { error: notificationError } = await db.from('info_notifications').insert(
      administratorIds.map((userId) => ({
        user_id: userId,
        title,
        message,
        type,
        link,
        is_read: false,
        created_at: timestamp,
        updated_at: timestamp,
      }))
    )

    if (notificationError) throw notificationError
    return administratorIds.length
  } catch (error) {
    console.error('Admin notification delivery failed:', error)
    return 0
  }
}
