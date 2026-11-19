function normalizePath(path) {
  const pathname = String(path || '/').split(/[?#]/, 1)[0] || '/'
  const normalized = pathname.replace(/\/+$/, '')
  return normalized || '/'
}

function getPathFromHref(href) {
  return normalizePath(href)
}

function matchesPath(pathname, targetPath, exact) {
  return exact
    ? pathname === targetPath
    : pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}

function toSearchParams(value) {
  if (value instanceof URLSearchParams) return value
  if (value && typeof value.get === 'function' && typeof value.toString === 'function') {
    return new URLSearchParams(value.toString())
  }
  if (typeof value === 'string') return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value)
  return new URLSearchParams()
}

function matchesQuery(item, searchParams) {
  const hrefQuery = String(item.href || '').split('?')[1] || ''
  const expectedParams = new URLSearchParams(hrefQuery)

  for (const [key, value] of expectedParams) {
    const actualValue = searchParams.get(key)
    if (actualValue !== value && !(actualValue === null && item.defaultParams?.[key] === value)) {
      return false
    }
  }

  if (item.exact) {
    const expectedPresentParams = [...expectedParams].filter(([key, value]) => (
      !(searchParams.get(key) === null && item.defaultParams?.[key] === value)
    )).length
    return [...searchParams].length === expectedPresentParams
  }

  return true
}

export function getActiveNavigationHref(pathname, items, currentSearchParams) {
  const currentPath = normalizePath(pathname)
  const searchParams = toSearchParams(currentSearchParams)
  const matches = []

  for (const item of items || []) {
    const targetPaths = (item.matchPaths || [item.href])
      .filter(Boolean)
      .map(getPathFromHref)
    const matchedPath = targetPaths
      .filter((targetPath) => matchesPath(currentPath, targetPath, item.exact))
      .sort((left, right) => right.length - left.length)[0]

    if (!matchedPath || !matchesQuery(item, searchParams)) continue
    matches.push({
      href: item.href,
      pathLength: matchedPath.length,
      queryLength: new URLSearchParams(String(item.href || '').split('?')[1] || '').size,
      exact: Boolean(item.exact),
    })
  }

  matches.sort((left, right) => (
    right.pathLength - left.pathLength
    || right.queryLength - left.queryLength
    || Number(right.exact) - Number(left.exact)
  ))

  return matches[0]?.href || null
}