import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getUserSessionVersion, revokeUserSessions } from './sessionVersions.js'

function sessionVersionClient(result) {
  const query = {
    select() {
      return this
    },
    eq() {
      return this
    },
    maybeSingle: async () => result,
  }
  return {
    from(table) {
      assert.equal(table, 'user_session_versions')
      return query
    },
  }
}

test('session version lookup returns the stored version and defaults missing rows to zero', async () => {
  assert.equal(await getUserSessionVersion(sessionVersionClient({ data: { version: '4' }, error: null }), 'user-1'), 4)
  assert.equal(await getUserSessionVersion(sessionVersionClient({ data: null, error: null }), 'user-1'), 0)
})

test('session version lookup preserves the migration 071 compatibility fallback', async () => {
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(
      await getUserSessionVersion(sessionVersionClient({ data: null, error: { code: 'PGRST205' } }), 'user-1'),
      0
    )
  } finally {
    console.warn = originalWarn
  }
})

test('session version lookup rejects missing inputs and database errors', async () => {
  await assert.rejects(getUserSessionVersion(null, 'user-1'), /service is unavailable/)
  await assert.rejects(getUserSessionVersion(sessionVersionClient({ data: null, error: null }), ''), /service is unavailable/)
  const databaseError = new Error('database unavailable')
  await assert.rejects(
    getUserSessionVersion(sessionVersionClient({ data: null, error: databaseError }), 'user-1'),
    (error) => error === databaseError
  )
})

test('session revocation requires a successful version increment', async () => {
  let rpcCall
  const client = {
    async rpc(name, args) {
      rpcCall = { name, args }
      return { data: 5, error: null }
    },
  }

  assert.equal(await revokeUserSessions(client, 'user-1'), 5)
  assert.deepEqual(rpcCall, { name: 'revoke_user_sessions', args: { p_user_id: 'user-1' } })
  await assert.rejects(revokeUserSessions(client, ''), /service is unavailable/)
  await assert.rejects(
    revokeUserSessions({ rpc: async () => ({ data: 0, error: null }) }, 'user-1'),
    /invalid version/
  )
})
