import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasCriticalCommentSafetySignal,
  sanitizeCommentContent,
} from './commentSafety.mjs'

test('comment content is reduced to safe plain text', () => {
  assert.equal(sanitizeCommentContent('Hello <strong>Daet</strong>'), 'Hello Daet')
  assert.equal(sanitizeCommentContent('A & B'), 'A & B')
  assert.equal(sanitizeCommentContent('<script>alert(1)</script>'), '')
})

test('only critical threats and configured critical terms are blocked', () => {
  assert.equal(hasCriticalCommentSafetySignal('I will attack you'), true)
  assert.equal(hasCriticalCommentSafetySignal('this mentions weapon'), false)
  assert.equal(hasCriticalCommentSafetySignal('this mentions unsafe', ['unsafe']), true)
  assert.equal(hasCriticalCommentSafetySignal('this mentions unsafe-ish', ['unsafe']), true)
})
