// lib/trackActivity.js
// Fire-and-forget helper for recording user engagement (comment / like / share
// / save) and notifying admins. Safe to call without awaiting — it swallows
// errors so engagement UX is never blocked by activity tracking.

const ACTIVITY_DETAILS = {
  comment: {
    title: 'New Comment',
    verb: 'commented on',
    userTitle: 'New comment on your post',
    userVerb: 'commented on your post',
  },
  react_content: {
    title: 'New Reaction',
    verb: 'reacted to',
    userTitle: 'Someone reacted to your post',
    userVerb: 'reacted to your post',
  },
  share_content: {
    title: 'New Share',
    verb: 'shared',
    userTitle: 'Someone shared your post',
    userVerb: 'shared your post',
  },
  save_content: {
    title: 'New Save',
    verb: 'saved',
    userTitle: 'Someone saved your post',
    userVerb: 'saved your post',
  },
  new_post: {
    title: 'New Post',
    verb: 'published a new post',
    userTitle: 'New post from admin',
    userVerb: 'published a new post',
  },
}

function buildActivityMeta(activityType) {
  return ACTIVITY_DETAILS[activityType] || { title: 'New User Activity', verb: 'interacted with' }
}

function buildActivityMessage({ actorName = 'A user', activityType, contentTitle, entityType }) {
  const meta = buildActivityMeta(activityType)
  const targetName = contentTitle || entityType || 'content'
  return `${actorName} ${meta.verb} "${targetName}".`
}

function buildUserNotificationTitle(activityType) {
  return ACTIVITY_DETAILS[activityType]?.userTitle || 'New activity'
}

function buildUserNotificationMessage({ actorName = 'A user', activityType, contentTitle, entityType }) {
  const meta = buildActivityMeta(activityType)
  const targetName = contentTitle || entityType || 'this post'

  if (activityType === 'new_post') {
    return `${actorName} ${meta.userVerb || meta.verb}: "${targetName}".`
  }

  return `${actorName} ${meta.userVerb || meta.verb} "${targetName}".`
}

async function trackUserActivity({
  userId,
  activityType,
  entityType,
  entityId,
  description,
  metadata = {},
}) {
  if (!userId || !activityType) return { success: false }

  try {
    const response = await fetch('/api/activity/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, activityType, entityType, entityId, description, metadata }),
    })
    return await response.json()
  } catch (err) {
    console.error('Failed to track user activity:', err)
    return { success: false }
  }
}

module.exports = {
  ACTIVITY_DETAILS,
  buildActivityMeta,
  buildActivityMessage,
  buildUserNotificationTitle,
  buildUserNotificationMessage,
  trackUserActivity,
}