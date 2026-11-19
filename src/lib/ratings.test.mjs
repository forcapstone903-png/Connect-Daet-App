import test from 'node:test'
import assert from 'node:assert/strict'
import { isOptionalRating, isValidRating } from './ratings.mjs'

test('accepts each whole-star rating from 1 through 5', () => {
  for (let rating = 1; rating <= 5; rating += 1) {
    assert.equal(isValidRating(rating), true)
  }
})

test('rejects values outside the whole-star range', () => {
  for (const rating of [0, 6, -1, 2.5, '5', null]) {
    assert.equal(isValidRating(rating), false)
  }
})

test('allows an unselected rating while rejecting invalid chosen ratings', () => {
  assert.equal(isOptionalRating(0), true)
  for (let rating = 1; rating <= 5; rating += 1) {
    assert.equal(isOptionalRating(rating), true)
  }
  for (const rating of [-1, 6, 2.5, '5']) {
    assert.equal(isOptionalRating(rating), false)
  }
})
