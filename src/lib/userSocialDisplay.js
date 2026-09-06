function normalizeUserType(value) {
  return String(value || '').trim().toLowerCase()
}

function getAuthorDisplayName(author = {}, fallback = 'Community member') {
  if (!author || typeof author !== 'object') {
    return fallback
  }

  const normalizedType = normalizeUserType(author.user_type)
  const directName = String(author.full_name || author.name || '').trim()

  if (normalizedType === 'admin') {
    return directName || 'Administrator'
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
