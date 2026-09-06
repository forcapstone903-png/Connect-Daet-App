const test = require('node:test')
const assert = require('node:assert/strict')
const { getRequiredSelectionCount, matchesMessageSearch, splitLocation } = require('./userSectionUtils')

test('message search matches the actual body field and title text', () => {
  const message = { title: 'Community update', body: 'Beach cleanup this Saturday' }

  assert.equal(matchesMessageSearch(message, 'cleanup'), true)
  assert.equal(matchesMessageSearch(message, 'community update'), true)
  assert.equal(matchesMessageSearch(message, 'nope'), false)
})

test('selection requirements cap at available data so sparse onboarding flows still proceed', () => {
  assert.equal(getRequiredSelectionCount(0), 0)
  assert.equal(getRequiredSelectionCount(1), 1)
  assert.equal(getRequiredSelectionCount(2), 2)
  assert.equal(getRequiredSelectionCount(5), 3)
})

test('location parsing preserves multi-part values instead of splitting them into a broken city/country pair', () => {
  const parsed = splitLocation('Daet, Camarines Norte, Philippines')

  assert.equal(parsed.city, 'Daet')
  assert.equal(parsed.country, 'Camarines Norte, Philippines')
  assert.equal(parsed.location, 'Daet, Camarines Norte, Philippines')
})
