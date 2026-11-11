import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { DEFAULT_REWARD_SETTINGS, validateRewardSettings } from './rewardSettings.mjs'

const require = createRequire(import.meta.url)
const { getRewardBadges } = require('./gamification.js')

test('reward settings accept supported actions and a valid catalog', () => {
  const result = validateRewardSettings(structuredClone(DEFAULT_REWARD_SETTINGS))
  assert.equal(result.error, undefined)
  assert.equal(result.settings.actions.comment.points, 0.01)
  assert.equal(result.settings.rewards.length, 3)
})

test('reward settings reject unknown or malformed rewards', () => {
  const malformed = structuredClone(DEFAULT_REWARD_SETTINGS)
  malformed.rewards.push({ ...malformed.rewards[0] })
  assert.match(validateRewardSettings(malformed).error, /unique valid ID/)
})

test('reward settings reject invalid action point amounts', () => {
  const malformed = structuredClone(DEFAULT_REWARD_SETTINGS)
  malformed.actions.comment.points = 0.001
  assert.match(validateRewardSettings(malformed).error, /at most two decimal places/)
})

test('reward settings validate unique achievement milestones and thresholds', () => {
  const malformed = structuredClone(DEFAULT_REWARD_SETTINGS)
  malformed.milestones.push({ name: 'explorer', description: 'Duplicate', points: 120 })
  assert.match(validateRewardSettings(malformed).error, /names must be unique/)

  const valid = structuredClone(DEFAULT_REWARD_SETTINGS)
  valid.milestones[1].points = 180
  assert.equal(validateRewardSettings(valid).settings.milestones[1].points, 180)
})

test('achievement badges follow administrator-configured thresholds', () => {
  const milestones = [{ name: 'Local Guide', description: 'Reach 40 points', points: 40 }]
  assert.deepEqual(getRewardBadges(39, milestones), [])
  assert.deepEqual(getRewardBadges(40, milestones), [{ name: 'Local Guide', description: 'Reach 40 points' }])
})
