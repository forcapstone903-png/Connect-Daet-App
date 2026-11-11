export function getAdminAuthorizationStatus(session) {
  if (!session?.user_id) return 401

  const role = String(session.role || '').trim().toLowerCase()
  return role === 'admin' || role === 'administrator' ? null : 403
}
