const test = require('node:test')
const assert = require('node:assert/strict')

async function loadCache() {
  return import('./cache.js')
}

test('cache returns fresh entries and expires them by TTL', async () => {
  const { clearAllCache, getCache, setCache } = await loadCache()
  clearAllCache()
  setCache('test:fresh', { value: 1 }, 1000)
  assert.deepEqual(getCache('test:fresh')?.data, { value: 1 })
  clearAllCache()
})

test('cache supports prefix invalidation and user cleanup', async () => {
  const { clearAllCache, getCache, getCacheKey, invalidateCachePrefix, setCache } = await loadCache()
  clearAllCache()
  setCache(getCacheKey('feed', 'user', 'one'), { value: 1 }, 1000)
  setCache(getCacheKey('profile', 'user', 'one'), { value: 2 }, 1000)
  setCache(getCacheKey('feed', 'user', 'two'), { value: 3 }, 1000)
  invalidateCachePrefix('feed:user:one')
  assert.equal(getCache('feed:user:one'), null)
  assert.deepEqual(getCache('profile:user:one')?.data, { value: 2 })
  assert.deepEqual(getCache('feed:user:two')?.data, { value: 3 })
  clearAllCache()
})
