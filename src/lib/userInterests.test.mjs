import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const {
  USER_INTEREST_CATEGORIES,
  normalizeUserInterests,
  hasValidInterestInput,
  getInterestRecommendationTerms,
  getInterestMatchScore,
  getStoryRecommendationCategories,
} = require('./userInterests.js')

test('interest normalization keeps canonical values, maps legacy values, and removes duplicates', () => {
  assert.deepEqual(USER_INTEREST_CATEGORIES, [
    'Beaches and Coastal Destinations',
    'Historical and Cultural Sites',
    'Food and Local Cuisine',
    'Festivals and Events',
    'Nature and Adventure',
    'Religious Tourism',
    'Arts and Crafts',
    'Local Businesses',
    'Community Activities',
    'Travel and Photography',
  ])
  assert.deepEqual(normalizeUserInterests(['Food', 'Food and Local Cuisine', 'Unknown']), [
    'Food and Local Cuisine',
  ])
  assert.equal(hasValidInterestInput(['Food and Local Cuisine']), true)
  assert.equal(hasValidInterestInput(['Food']), false)
  assert.equal(getInterestMatchScore(['Seafood Grill'], ['Food and Local Cuisine']), 1)
})

test('interest categories map to recommendation terms for the existing content categories', () => {
  const interests = ['Beaches and Coastal Destinations', 'Festivals and Events']
  assert.ok(getInterestRecommendationTerms(interests).includes('beach'))
  assert.equal(getInterestMatchScore(['beach', 'festival'], interests), 2)
  assert.deepEqual(getStoryRecommendationCategories(interests), ['travel_guides', 'events'])
})
