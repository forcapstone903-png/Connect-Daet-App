import assert from 'node:assert/strict'
import test from 'node:test'
import { getActiveNavigationHref } from './routeMatching.mjs'

const userNavigation = [
  { href: '/info/user/dashboard', exact: true },
  { href: '/info/user/profile' },
  { href: '/info/user/blogs/new', exact: true },
]

test('matches nested pages only at route boundaries', () => {
  assert.equal(getActiveNavigationHref('/info/user/profile/edit', userNavigation), '/info/user/profile')
  assert.equal(getActiveNavigationHref('/info/user/profiled', userNavigation), null)
})

test('selects only the most specific matching navigation item', () => {
  const items = [
    { href: '/info/user' },
    { href: '/info/user/profile' },
  ]

  assert.equal(getActiveNavigationHref('/info/user/profile/archive', items), '/info/user/profile')
})

test('matches query-specific items and prefers them over a general route', () => {
  const items = [
    { href: '/info/visitor/search' },
    { href: '/info/visitor/search?type=blogs' },
  ]

  assert.equal(
    getActiveNavigationHref('/info/visitor/search', items, new URLSearchParams('type=blogs')),
    '/info/visitor/search?type=blogs',
  )
  assert.equal(
    getActiveNavigationHref('/info/visitor/search', items, new URLSearchParams('type=events')),
    '/info/visitor/search',
  )
})

test('honors exact query matching and default query values', () => {
  const item = { href: '/info/admin/settings/general', exact: true }
  const defaultedItem = {
    href: '/info/admin/blogs?status=all',
    exact: true,
    defaultParams: { status: 'all' },
  }

  assert.equal(getActiveNavigationHref(item.href, [item], new URLSearchParams('extra=1')), null)
  assert.equal(getActiveNavigationHref(defaultedItem.href, [defaultedItem]), defaultedItem.href)
})

test('supports route aliases for nested public pages', () => {
  const stories = {
    href: '/info/visitor/search',
    matchPaths: ['/info/visitor/search', '/info/visitor/blog'],
  }

  assert.equal(getActiveNavigationHref('/info/visitor/blog/post-id', [stories]), stories.href)
})