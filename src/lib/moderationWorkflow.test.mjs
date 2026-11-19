import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyModerationRisk,
  getAutoPublishEligibility,
  prioritizeModerationQueue,
  scoreModerationSignals,
} from './moderationWorkflow.mjs'

test('moderation scores are clamped and classified using the configured thresholds', () => {
  assert.equal(classifyModerationRisk(-1), 'low')
  assert.equal(classifyModerationRisk(29), 'low')
  assert.equal(classifyModerationRisk(30), 'medium')
  assert.equal(classifyModerationRisk(69), 'medium')
  assert.equal(classifyModerationRisk(70), 'high')
  assert.equal(classifyModerationRisk(120), 'high')
})

test('critical signals and unavailable checks always require review', () => {
  const critical = scoreModerationSignals({ criticalViolation: true })
  assert.equal(critical.level, 'high')
  assert.equal(critical.requiresHumanReview, true)

  const unavailable = scoreModerationSignals({ checkUnavailable: true })
  assert.equal(unavailable.level, 'medium')
  assert.equal(unavailable.requiresHumanReview, true)
  assert.ok(unavailable.flags.includes('moderation_check_unavailable'))
})

test('missing signals do not add risk, but combined behavioral flags can escalate a post', () => {
  const noSignals = scoreModerationSignals()
  assert.equal(noSignals.score, 0)
  assert.equal(noSignals.level, 'low')
  assert.equal(noSignals.requiresHumanReview, false)

  const combined = scoreModerationSignals({
    configuredTermMatches: 1,
    duplicateContent: true,
    recentSubmissions: 5,
    validReports: 2,
  })
  assert.equal(combined.score, 100)
  assert.equal(combined.level, 'high')
  assert.equal(combined.requiresHumanReview, true)
})

test('auto-publishing requires every configured trust and safety condition', () => {
  const risk = { score: 12, level: 'low', checksPassed: true }
  const history = {
    accountAgeDays: 30,
    approvedPosts: 5,
    rejectedPosts: 0,
    violations: 0,
    recentSubmissions: 1,
    validReports: 0,
  }
  const policy = {
    enabled: true,
    minAccountAgeDays: 7,
    minApprovedPosts: 3,
    maxRejectedPosts: 0,
    maxViolations: 0,
    maxRecentSubmissions: 2,
  }

  assert.equal(getAutoPublishEligibility({ risk, history, policy }).eligible, true)
  assert.equal(getAutoPublishEligibility({
    risk: { ...risk, checksPassed: false },
    history,
    policy,
  }).eligible, false)
  assert.equal(getAutoPublishEligibility({
    risk,
    history: { ...history, approvedPosts: 2 },
    policy,
  }).eligible, false)
})

test('review queue puts high-risk and multi-report submissions before ordinary items', () => {
  const queue = prioritizeModerationQueue([
    { id: 'ordinary', risk_level: 'low', created_at: '2026-01-01T00:00:00Z' },
    { id: 'reports', risk_level: 'low', valid_report_count: 2, created_at: '2026-01-03T00:00:00Z' },
    { id: 'high', risk_level: 'high', created_at: '2026-01-04T00:00:00Z' },
    { id: 'medium-old', risk_level: 'medium', created_at: '2026-01-01T00:00:00Z' },
    { id: 'medium-new', risk_level: 'medium', created_at: '2026-01-02T00:00:00Z' },
  ])
  assert.deepEqual(queue.map((item) => item.id), ['high', 'reports', 'medium-old', 'medium-new', 'ordinary'])
})