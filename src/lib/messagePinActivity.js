export function getPinActivityDisplayName(activity, viewerUserId, viewerUser, otherUser) {
  if (!activity) return 'Community member'

  if (activity.actor_user_id === viewerUserId) {
    return 'You'
  }

  if (activity.actor?.full_name) {
    return activity.actor.full_name
  }

  if (activity.actor_user_id === otherUser?.id && otherUser?.full_name) {
    return otherUser.full_name
  }

  if (viewerUser?.full_name) {
    return viewerUser.full_name
  }

  return 'Community member'
}

export function getPinActivityText(activity, viewerUserId, viewerUser, otherUser) {
  const actorName = getPinActivityDisplayName(activity, viewerUserId, viewerUser, otherUser)
  const action = activity?.action_type === 'unpinned' ? 'unpinned' : 'pinned'
  return `${actorName} ${action} a message.`
}
