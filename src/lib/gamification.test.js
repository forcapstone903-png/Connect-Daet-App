const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getLevelFromPoints,
  getLevelProgress,
  getDailyStreak,
  getRewardBadges,
} = require('./gamification')

test('levels are derived from total points', () => {
  assert.equal(getLevelFromPoints(0), 1)
  assert.equal(getLevelFromPoints(120), 2)
  assert.equal(getLevelFromPoints(800), 4)
  assert.equal(getLevelFromPoints(2500), 6)
})

test('level progress is normalized between 0 and 100', () => {
  assert.equal(getLevelProgress(0), 0)
  assert.equal(getLevelProgress(120), 20)
  assert.equal(getLevelProgress(350), 100)
  assert.equal(getLevelProgress(1200), 80)
})

test('daily streaks count consecutive check-ins', () => {
  const streak = getDailyStreak([
    '2026-08-12',
    '2026-08-13',
    '2026-08-14',
    '2026-08-16',
  ])

  assert.equal(streak.current, 1)
  assert.equal(streak.longest, 3)
})

test('reward badges are generated from points and milestone progress', () => {
  const badges = getRewardBadges(1200)
  assert.ok(badges.some((badge) => badge.name === 'Explorer'))
  assert.ok(badges.some((badge) => badge.name === 'Top Contributor'))
})
