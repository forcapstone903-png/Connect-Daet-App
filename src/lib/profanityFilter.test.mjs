import assert from 'node:assert/strict'
import test from 'node:test'
import { findProfanityMatches, normalizeProfanityTerms } from './profanityFilter.mjs'

test('profanity terms normalize phrases, punctuation, Unicode, and long entries', () => {
  assert.deepEqual(normalizeProfanityTerms([' rude ', 'RUDE', '', 'word_2']), ['rude', 'word_z'])
  assert.deepEqual(normalizeProfanityTerms(['ruuuude']), ['rude'])
  assert.deepEqual(
    normalizeProfanityTerms(['multi-word phrase', 'caf\u00e9', 'a'.repeat(50), 'b*d']),
    ['multiword phrase', 'caf\u00e9', 'a', 'bd'],
  )
  assert.throws(() => normalizeProfanityTerms(['***']), /at least one letter or number/)
  assert.throws(() => normalizeProfanityTerms(Array(251).fill('term')), /no more than 250/)
  assert.deepEqual(normalizeProfanityTerms(['a'.repeat(10000)]), ['a'])
  assert.throws(() => normalizeProfanityTerms(['a'.repeat(10001)]), /cannot exceed 10000 characters/)
})

test('matching is case-insensitive and uses whole tokens', () => {
  assert.deepEqual(findProfanityMatches('That RUDE phrase is unacceptable; ruder is different.', ['rude']), ['rude'])
  assert.deepEqual(findProfanityMatches('bad,word badge', ['bad']), ['bad'])
})

test('matching normalizes number substitutions, repeated letters, and symbol masking', () => {
  const matches = findProfanityMatches(
    'B4DD baddddd b.a.d b*d badge',
    ['bad'],
  )

  assert.deepEqual(matches, ['bad'])
})

test('matching accepts phrases and Unicode terms without matching partial phrases', () => {
  assert.deepEqual(
    findProfanityMatches('This is a very ruuuude sentence. CAF\u00c9!', ['very rude', 'caf\u00e9']),
    ['very rude', 'caf\u00e9'],
  )
  assert.deepEqual(findProfanityMatches('cafe\u0301', ['caf\u00e9']), ['caf\u00e9'])
  assert.deepEqual(findProfanityMatches('very,rude!', ['very rude']), ['very rude'])
  assert.deepEqual(findProfanityMatches('very b*d!', ['very bad']), ['very bad'])
  assert.deepEqual(findProfanityMatches('very rude indeed', ['very ruder']), [])
})

test('symbol masking does not turn partial ordinary words into matches', () => {
  assert.deepEqual(findProfanityMatches('b.a b! badge', ['bad']), [])
})
