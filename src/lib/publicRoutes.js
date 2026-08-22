const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/confirm', '/callback', '/', '/welcome', '/access-denied']

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