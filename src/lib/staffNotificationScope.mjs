const ALERT_BROADCAST_TYPES = ['alert', 'alert_all_clear']

export function applyStaffNotificationScope(query, scope) {
  if (scope !== 'staff') return query

  return query
    .is('alert_id', null)
    .not('type', 'in', `(${ALERT_BROADCAST_TYPES.join(',')})`)
}

export function isStaffNotificationChange(payload) {
  const notification = payload?.new || payload?.old
  return Boolean(notification)
    && typeof notification.type === 'string'
    && (notification.alert_id === null || notification.alert_id === undefined)
    && !ALERT_BROADCAST_TYPES.includes(notification.type)
}
