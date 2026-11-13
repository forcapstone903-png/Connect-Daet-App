import assert from 'node:assert/strict'
import test from 'node:test'
import { notifyAdministrators, notifyTourismOfficers } from './adminNotifications.js'

function createDatabase(admins) {
  const calls = []
  return {
    calls,
    from(table) {
      if (table === 'info_users') {
        const query = {
          select() { return this },
          in() { return this },
          eq() { return this },
          then(resolve, reject) {
            return Promise.resolve({ data: admins, error: null }).then(resolve, reject)
          },
        }
        return query
      }

      return {
        async insert(rows) {
          calls.push({ table, rows })
          return { error: null }
        },
      }
    },
  }
}

test('notifyAdministrators sends an in-app notification to each active admin', async () => {
  const db = createDatabase([{ id: 'admin-1' }, { id: 'admin-2' }, { id: 'admin-1' }])

  const notified = await notifyAdministrators(db, {
    title: 'Blog awaiting approval',
    message: 'A new blog submission needs review.',
    type: 'warning',
    link: '/info/admin/blogs?status=pending',
  })

  assert.equal(notified, 2)
  assert.equal(db.calls.length, 1)
  assert.deepEqual(db.calls[0].rows.map((row) => row.user_id), ['admin-1', 'admin-2'])
  assert.ok(db.calls[0].rows.every((row) => row.is_read === false))
})

test('notifyTourismOfficers sends an in-app notification to each active tourism officer', async () => {
  const db = createDatabase([{ id: 'officer-1' }, { id: 'officer-2' }])

  const notified = await notifyTourismOfficers(db, {
    title: 'New user feedback',
    message: 'A user submitted feedback.',
    type: 'info',
    link: '/info/admin/feedback',
  })

  assert.equal(notified, 2)
  assert.equal(db.calls.length, 1)
  assert.deepEqual(db.calls[0].rows.map((row) => row.user_id), ['officer-1', 'officer-2'])
  assert.ok(db.calls[0].rows.every((row) => row.is_read === false && row.link === '/info/admin/feedback'))
})

test('notifyAdministrators skips insertion when no active admins are found', async () => {
  const db = createDatabase([])

  const notified = await notifyAdministrators(db, {
    title: 'Content reported',
    message: 'A report needs review.',
    link: '/info/admin/moderation',
  })

  assert.equal(notified, 0)
  assert.equal(db.calls.length, 0)
})
