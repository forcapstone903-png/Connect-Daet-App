function normalizeUserType(value) {
  return String(value || '').trim().toLowerCase()
}

const DEFAULT_ADMIN_DISPLAY_NAME = 'Daet Tourism Admin'
const GENERIC_ADMIN_NAMES = new Set([
  'admin',
  'administrator',
  'system administrator',
  'daet tourism administrator',
])

function getAuthorDisplayName(author = {}, fallback = 'Community member') {
  if (!author || typeof author !== 'object') {
    return fallback
  }

  const normalizedType = normalizeUserType(author.user_type)
  const directName = String(author.full_name || author.name || '').trim()

  if (normalizedType === 'admin') {
    return directName && !GENERIC_ADMIN_NAMES.has(directName.toLowerCase())
      ? directName
      : DEFAULT_ADMIN_DISPLAY_NAME
  }

  return directName || fallback
}

function getAuthorRoleLabel(author = {}) {
  if (!author || typeof author !== 'object') {
    return ''
  }

  const normalizedType = normalizeUserType(author.user_type)

  if (normalizedType === 'admin') {
    return 'Administrator'
  }

  return ''
}

module.exports = {
  getAuthorDisplayName,
  getAuthorRoleLabel,
}
