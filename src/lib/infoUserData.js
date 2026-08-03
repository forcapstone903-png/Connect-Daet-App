export function buildInfoUserRecord({
  id,
  email,
  fullName,
  userType,
  points = 0,
  status = 'active',
}) {
  return {
    id,
    email: email?.toLowerCase().trim(),
    full_name: fullName || '',
    user_type: userType || 'tourist',
    points,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}
