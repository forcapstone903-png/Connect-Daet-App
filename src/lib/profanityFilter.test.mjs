import assert from 'node:assert/strict'
import test from 'node:test'
import { findProfanityMatches, normalizeProfanityTerms } from './profanityFilter.mjs'

test('profanity terms are normalized, deduplicated and bounded', () => {
  assert.deepEqual(normalizeProfanityTerms([' rude ', 'RUDE', '', 'word_2']), ['rude', 'word_2'])
  assert.throws(() => normalizeProfanityTerms(['contains spaces']), /letters, numbers/)
  assert.throws(() => normalizeProfanityTerms(Array(251).fill('term')), /no more than 250/)
})

test('matching is case-insensitive and uses whole tokens', () => {
  assert.deepEqual(findProfanityMatches('That RUDE phrase is unacceptable; ruder is different.', ['rude']), ['rude'])
})
