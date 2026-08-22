export function buildInfoUserRecord({
  id,
  email,
  fullName,
  userType,
  password,
  mobileNumber,
  points = 0,
  status = 'active',
}) {
  const record = {
    id,
    email: email?.toLowerCase().trim(),
    full_name: fullName || '',
    phone_number: mobileNumber ? String(mobileNumber).trim() : null,
    user_type: userType || 'tourist',
    points,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (password !== undefined) {
    record.password = password
  }

  return record
}
