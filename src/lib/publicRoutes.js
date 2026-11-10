const PUBLIC_PATHS = ['/info/login', '/info/register', '/info/forgot-password', '/info/reset-password', '/info/account-recovery', '/info/confirm', '/info/callback', '/', '/info/visitor', '/info/access-denied', '/info/maintenance']

function normalizePathname(pathname = '') {
  const normalized = String(pathname || '/').trim()
  if (normalized === '') return '/'
  return normalized.replace(/\/+$/, '') || '/'
}

function isPublicPathname(pathname = '') {
  const normalized = normalizePathname(pathname)

  return PUBLIC_PATHS.some((publicPath) => {
    const normalizedPublic = normalizePathname(publicPath)
    return normalizedPublic === normalized || (
      normalizedPublic !== '/' && normalized.startsWith(`${normalizedPublic}/`)
    )
  })
}

module.exports = {
  PUBLIC_PATHS,
  normalizePathname,
  isPublicPathname,
}