import assert from 'node:assert/strict'
import test from 'node:test'
import { getEngagementContentHref } from './engagementContentLinks.mjs'

test('engagement content links resolve supported content types', () => {
  assert.equal(getEngagementContentHref('blog', 'blog-1'), '/info/visitor/blog/blog-1')
  assert.equal(getEngagementContentHref('tourist_spot', 'spot-1'), '/info/visitor/tourist-spots/spot-1')
  assert.equal(getEngagementContentHref('event', 'event-1'), '/info/visitor/events/event-1')
  assert.equal(getEngagementContentHref('forum_thread', 'thread-1'), '/info/visitor/forum/thread-1')
  assert.equal(getEngagementContentHref('user_post', 'post-1'), '/info/user/posts/post-1')
  assert.equal(getEngagementContentHref('announcement', 'announcement-1'), '/info/user/announcements/announcement-1')
})

test('engagement content links safely handle aliases, ids, and unsupported records', () => {
  assert.equal(getEngagementContentHref(' FORUM ', 'thread/1'), '/info/visitor/forum/thread%2F1')
  assert.equal(getEngagementContentHref('unknown', 'content-1'), null)
  assert.equal(getEngagementContentHref('blog', ''), null)
  assert.equal(getEngagementContentHref(null, 'content-1'), null)
})
