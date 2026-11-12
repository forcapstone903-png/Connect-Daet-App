export async function notifyContentAuthorsOfDeletion(client, contentItems) {
  const notifications = contentItems
    .filter(({ authorId, actorId }) => authorId && authorId !== actorId)
    .map(({ authorId, contentType, contentTitle }) => {
      const title = typeof contentTitle === 'string' ? contentTitle.trim().slice(0, 160) : ''
      const subject = title ? ` "${title}"` : ''
      return {
        user_id: authorId,
        title: 'Your content was removed',
        message: `Your ${contentType}${subject} was removed by the moderation team. If you have questions, contact the tourism office.`,
        type: 'moderation',
        is_read: false,
        link: '/info/user/notifications',
      }
    })
  if (!notifications.length) return { sent: 0, failed: 0, warning: null }

  try {
    const { error } = await client.from('info_notifications').insert(notifications)
    if (error) throw error
    return { sent: notifications.length, failed: 0, warning: null }
  } catch (error) {
    console.error('Content-deletion notification failed:', error)
    return {
      sent: 0,
      failed: notifications.length,
      warning: notifications.length === 1
        ? 'The content was deleted, but its author could not be notified.'
        : `The content was deleted, but ${notifications.length} author(s) could not be notified.`,
    }
  }
}

export async function notifyContentAuthorOfDeletion(client, contentItem) {
  const result = await notifyContentAuthorsOfDeletion(client, [contentItem])
  return { sent: result.sent === 1, warning: result.warning }
}

export async function notifyBlogAuthorsOfUnpublish(client, blogItems, reason = '') {
  const cleanedReason = typeof reason === 'string' ? reason.trim().slice(0, 1000) : ''
  const notifications = blogItems
    .filter(({ authorId, actorId }) => authorId && authorId !== actorId)
    .map(({ authorId, contentTitle }) => {
      const title = typeof contentTitle === 'string' ? contentTitle.trim().slice(0, 160) : ''
      const subject = title ? ` "${title}"` : ''
      const note = cleanedReason ? ` Reason: ${cleanedReason}` : ''
      return {
        user_id: authorId,
        title: 'Your blog was unpublished',
        message: `Your blog post${subject} was unpublished by the moderation team.${note}`,
        type: 'moderation',
        is_read: false,
        link: '/info/user/notifications',
      }
    })
  if (!notifications.length) return { sent: 0, failed: 0, warning: null }

  try {
    const { error } = await client.from('info_notifications').insert(notifications)
    if (error) throw error
    return { sent: notifications.length, failed: 0, warning: null }
  } catch (error) {
    console.error('Blog-unpublish notification failed:', error)
    return {
      sent: 0,
      failed: notifications.length,
      warning: notifications.length === 1
        ? 'The blog was unpublished, but its author could not be notified.'
        : `The blogs were unpublished, but ${notifications.length} author(s) could not be notified.`,
    }
  }
}
