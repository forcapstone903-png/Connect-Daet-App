import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  BACKUP_VERSION,
  createAdminDataBackup,
  validateAdminDataBackup,
} from './adminDataBackup.js'

function createBackupClient() {
  return {
    from(table) {
      return {
        select() {
          return this
        },
        order() {
          return this
        },
        range() {
          return Promise.resolve({
            data: table === 'info_users'
              ? [{ id: 'user-1', password: 'must-not-be-exported', email: 'person@example.test' }]
              : [],
            error: null,
          })
        },
      }
    },
  }
}

test('scheduled and downloaded snapshots share the supported application table scope', async () => {
  const backup = JSON.parse(await createAdminDataBackup(createBackupClient(), { includeMedia: true }))

  assert.deepEqual(Object.keys(backup.tables), BACKUP_TABLES)
  assert.equal(backup.mediaIncluded, true)
  assert.equal(backup.tables.info_users[0].password, undefined)
  assert.equal(backup.tables.info_users[0].email, 'person@example.test')
  assert.equal(backup.excludedData.includes('media files'), false)
})

test('snapshots explicitly record excluded media when media copying is disabled', async () => {
  const backup = JSON.parse(await createAdminDataBackup(createBackupClient()))

  assert.equal(backup.mediaIncluded, false)
  assert.equal(backup.excludedData.includes('media files'), true)
})

function validBackup() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, []])),
  }
}

test('validates supported, complete admin data snapshots', () => {
  assert.equal(validateAdminDataBackup(validBackup()), null)
})

test('rejects unsupported, incomplete, or unknown backup formats', () => {
  const wrongVersion = validBackup()
  wrongVersion.version += 1
  assert.match(validateAdminDataBackup(wrongVersion), /format or version/)

  const missingTable = validBackup()
  delete missingTable.tables.info_users
  assert.match(validateAdminDataBackup(missingTable), /missing tables/)

  const unknownTable = validBackup()
  unknownTable.tables.private_tokens = []
  assert.match(validateAdminDataBackup(unknownTable), /unsupported tables/)
})

test('rejects malformed rows and duplicate record identifiers', () => {
  const missingId = validBackup()
  missingId.tables.info_users = [{ email: 'person@example.test' }]
  assert.match(validateAdminDataBackup(missingId), /without a valid id/)

  const duplicateIds = validBackup()
  duplicateIds.tables.info_users = [{ id: 'user-1' }, { id: 'user-1' }]
  assert.match(validateAdminDataBackup(duplicateIds), /duplicate id/)
})
