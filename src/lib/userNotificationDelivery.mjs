export async function notifyUserRecipients(client, notifications, source) {
  if (!client || !Array.isArray(notifications) || !source) {
    throw new TypeError('A database client, notification list, and source are required.')
  }

  const timestamp = new Date().toISOString()
  const seen = new Set()
  let delivered = 0

  for (const notification of notifications) {
    if (!notification?.user_id || !notification.title || !notification.message || !notification.type) continue

    const key = [
      notification.user_id,
      notification.link || '',
      notification.type,
      notification.actor_id || '',
    ].join(':')
    if (seen.has(key)) continue
    seen.add(key)

    const row = {
      user_id: notification.user_id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      is_read: false,
      created_at: timestamp,
      updated_at: timestamp,
      ...(notification.link ? { link: notification.link } : {}),
      ...(notification.actor_id ? { actor_id: notification.actor_id } : {}),
    }

    const { error } = await client.from('info_notifications').insert(row)
    if (error?.code === '23505') continue
    if (error) {
      console.error(`${source} notification insert failed:`, {
        code: error.code || null,
        type: notification.type,
      })
      continue
    }
    delivered += 1
  }

  return delivered
}
