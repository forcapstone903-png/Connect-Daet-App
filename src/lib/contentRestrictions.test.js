import assert from 'node:assert/strict'
import test from 'node:test'
import { getActiveCommentRestriction } from './contentRestrictions.js'

function createClient({ bans = [], mute = null, missingBanType = false } = {}) {
  return {
    from(table) {
      const filters = {}
      let legacyQuery = false
      const builder = {
        select(columns) {
          legacyQuery = !columns.includes('ban_type')
          return builder
        },
        eq(column, value) {
          filters[column] = value
          return builder
        },
        is(column, value) {
          filters[column] = value
          return builder
        },
        or() {
          return builder
        },
        async maybeSingle() {
          if (table === 'admin_comment_mutes') return { data: mute, error: null }
          if (missingBanType && !legacyQuery) return { data: null, error: { code: '42703' } }
          const ban = bans.find((item) => !filters.ban_type || item.ban_type === filters.ban_type)
          return { data: ban || null, error: null }
        },
      }
      return builder
    },
  }
}

test('suspensions do not block comments, while posting bans and comment mutes still do', async () => {
  const suspension = { ban_type: 'suspension', reason: 'Account suspension' }
  const postingBan = { ban_type: 'posting', reason: 'Posting restriction' }

  assert.equal(await getActiveCommentRestriction(createClient({ bans: [suspension] }), 'user-1'), null)
  assert.equal((await getActiveCommentRestriction(createClient({ bans: [postingBan] }), 'user-1'))?.reason, 'Posting restriction')
  assert.equal((await getActiveCommentRestriction(createClient({ mute: { reason: 'Comment mute' } }), 'user-1'))?.reason, 'Comment mute')
})

test('legacy ban tables without ban_type continue to enforce comment restrictions', async () => {
  const legacyBan = { reason: 'Legacy posting restriction' }
  assert.equal(
    (await getActiveCommentRestriction(createClient({ bans: [legacyBan], missingBanType: true }), 'user-1'))?.reason,
    'Legacy posting restriction',
  )
})
