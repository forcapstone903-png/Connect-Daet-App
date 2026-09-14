'use client'

const memoryCache = new Map()
const CACHE_VERSION = 1

function now() {
  return Date.now()
}

function isValidEntry(entry) {
  return Boolean(entry)
    && entry.version === CACHE_VERSION
    && typeof entry.cachedAt === 'number'
    && typeof entry.expiresAt === 'number'
    && Object.prototype.hasOwnProperty.call(entry, 'data')
}

export function getCache(key, { allowStale = false } = {}) {
  const entry = memoryCache.get(key)
  if (!isValidEntry(entry)) {
    memoryCache.delete(key)
    return null
  }

  if (!allowStale && now() >= entry.expiresAt) return null
  return { ...entry, stale: now() >= entry.expiresAt }
}

export function setCache(key, data, ttlMs) {
  const entry = {
    version: CACHE_VERSION,
    cachedAt: now(),
    expiresAt: now() + Math.max(0, Number(ttlMs) || 0),
    data,
  }
  memoryCache.set(key, entry)
  return entry
}

export function invalidateCache(key) {
  if (!key) return
  memoryCache.delete(key)
}

export function invalidateCachePrefix(prefix) {
  if (!prefix) return
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key)
  }
}

export function clearUserCache(userId) {
  if (!userId) return
  invalidateCachePrefix(`feed:user:${userId}`)
  invalidateCachePrefix(`profile:user:${userId}`)
  invalidateCachePrefix(`notifications:user:${userId}`)
  invalidateCachePrefix(`signals:user:${userId}`)
  invalidateCachePrefix(`following:user:${userId}`)
}

export function clearAllCache() {
  memoryCache.clear()
}

export function getPersistentCache(key, { allowStale = false } = {}) {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(`daet:cache:${key}`)
    if (!raw) return null
    const entry = JSON.parse(raw)
    if (!isValidEntry(entry)) throw new Error('Invalid cache entry')
    if (!allowStale && now() >= entry.expiresAt) return null
    return { ...entry, stale: now() >= entry.expiresAt }
  } catch {
    try {
      window.localStorage.removeItem(`daet:cache:${key}`)
    } catch {
      // Ignore storage failures and fall back to the network.
    }
    return null
  }
}

export function setPersistentCache(key, data, ttlMs) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(`daet:cache:${key}`, JSON.stringify({
      version: CACHE_VERSION,
      cachedAt: now(),
      expiresAt: now() + Math.max(0, Number(ttlMs) || 0),
      data,
    }))
  } catch {
    // Quota and private-mode failures must not block the feature.
  }
}

export function invalidatePersistentCache(key) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(`daet:cache:${key}`)
  } catch {
    // Ignore storage failures.
  }
}

export function getCacheKey(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part).trim().replace(/[^a-zA-Z0-9:_-]/g, '_'))
    .join(':')
}

export function getCacheStats() {
  return { entries: memoryCache.size }
}
