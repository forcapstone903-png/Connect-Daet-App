export function getNewUnreadStaffNotifications(notifications, previousIds, incomingId = null) {
  const unreadNotifications = (notifications || []).filter((notification) => (
    notification?.id && !notification.is_read
  ))

  if (previousIds === null) {
    return incomingId
      ? unreadNotifications.filter((notification) => notification.id === incomingId)
      : []
  }

  return unreadNotifications.filter((notification) => !previousIds.has(notification.id))
}
