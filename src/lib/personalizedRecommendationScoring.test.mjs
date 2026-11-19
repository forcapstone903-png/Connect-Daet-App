import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clamp100,
  haversineDistanceKm,
  normalizedOverlap,
  normalizeDistance,
  normalizeRecency,
  scorePeople,
  scoreStory,
  scorePlace,
  scoreEvent,
} from './personalizedRecommendationScoring.mjs'

test('normalizes factors and weighted scores to 0-100', () => {
  assert.equal(clamp100(-4), 0)
  assert.equal(clamp100(140), 100)
  assert.equal(normalizedOverlap(['Beach', 'Food'], ['Beach']), 50)
  assert.equal(normalizeRecency(Date.now(), Date.now()), 100)
})

test('distance is null when coordinates are missing', () => {
  assert.equal(haversineDistanceKm({ latitude: null, longitude: null }, { latitude: 14, longitude: 122 }), null)
  assert.equal(normalizeDistance(null), 50)
})

test('hybrid weighted scores use the required weights', () => {
  assert.equal(scorePeople({ interests: 100, mutual: 100, activity: 100, popularity: 100 }), 100)
  assert.equal(scoreStory({ interest: 100, engagement: 100, recency: 100, popularity: 100 }), 100)
  assert.equal(scorePlace({ interest: 100, distance: 100, rating: 100, popularity: 100 }), 100)
  assert.equal(scoreEvent({ interest: 100, proximity: 100, upcoming: 100, popularity: 100 }), 100)
})
