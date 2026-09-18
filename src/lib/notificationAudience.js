function isMissingNotificationColumn(error) {
  return Boolean(error) && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(error.message || ''))
}

// Audience data is deliberately not cached: each write uses current followers.
// Notification failures must not turn an already-created post into a failed save.
export async function notifyFollowers(db, { authorId, type, link, postId, title, actionText, subject, status = 'published', visibility = 'public' }) {
  if (!db || !authorId || !link || !['published', 'draft', 'archived'].includes(status) || visibility === 'private') return 0

  let inserted = 0
  try {
    const { data: author, error: authorError } = await db.from('info_users').select('full_name').eq('id', authorId).maybeSingle()
    if (authorError) throw authorError
    const authorName = author?.full_name || 'Someone you follow'
    const seen = new Set([authorId])
    const pageSize = 200

    for (let offset = 0; ; offset += pageSize) {
      const { data: followers, error: followersError } = await db.from('user_follows')
        .select('follower_id').eq('following_id', authorId).neq('follower_id', authorId)
        .order('follower_id', { ascending: true }).range(offset, offset + pageSize - 1)
      if (followersError) throw followersError
      const ids = (followers || []).map((row) => row.follower_id).filter((id) => {
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })

      if (ids.length) {
        const { data: existing, error: lookupError } = await db.from('info_notifications')
          .select('user_id').eq('link', link).eq('type', type).in('user_id', ids)
        if (lookupError) throw lookupError
        const notified = new Set((existing || []).map((row) => row.user_id))
        const timestamp = new Date().toISOString()
        const rows = ids.filter((id) => !notified.has(id)).map((id) => ({
          user_id: id, title, message: `${authorName} ${actionText}: ${subject}`, type,
          is_read: false, created_at: timestamp, updated_at: timestamp,
          link, post_id: postId, post_owner_id: authorId, actor_id: authorId,
        }))

        if (rows.length) {
          let payload = rows
          let { error } = await db.from('info_notifications').insert(payload)
          if (isMissingNotificationColumn(error)) {
            payload = rows.map((row) => {
              const copy = { ...row }
              delete copy.post_id
              delete copy.post_owner_id
              return copy
            })
            ;({ error } = await db.from('info_notifications').insert(payload))
            if (isMissingNotificationColumn(error)) {
              payload = payload.map((row) => {
                const copy = { ...row }
                delete copy.actor_id
                return copy
              })
              ;({ error } = await db.from('info_notifications').insert(payload))
            }
          }
          // A concurrent insert can conflict with one row and abort the entire batch.
          // Retry individually so other recipients still receive their notification.
          if (error?.code === '23505') {
            for (const row of payload) {
              const result = await db.from('info_notifications').insert(row)
              if (result.error && result.error.code !== '23505') throw result.error
              if (!result.error) inserted += 1
            }
          } else {
            if (error) throw error
            inserted += rows.length
          }
        }
      }
      if ((followers || []).length < pageSize) break
    }
  } catch (error) {
    console.error('Follower notification delivery failed:', error)
  }
  return inserted
}
