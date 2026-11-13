import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inferToastType, notifyToast } from './toast.mjs'

test('toast severity is inferred from common action outcomes', () => {
  assert.equal(inferToastType('Your submission is pending administrator approval.'), 'warning')
  assert.equal(inferToastType('Unable to save changes.'), 'error')
  assert.equal(inferToastType('Profile updated successfully.'), 'success')
  assert.equal(inferToastType('New tourism information is available.'), 'info')
})

test('notifyToast dispatches typed messages and rejects empty messages', () => {
  const originalWindow = globalThis.window
  const originalCustomEvent = globalThis.CustomEvent
  const dispatchedEvents = []

  globalThis.window = {
    dispatchEvent(event) {
      dispatchedEvents.push(event)
    },
  }
  globalThis.CustomEvent = class CustomEvent {
    constructor(name, options) {
      this.type = name
      this.detail = options.detail
    }
  }

  try {
    assert.equal(notifyToast('Saved.', 'success', 2500), true)
    assert.equal(notifyToast('  '), false)
    assert.equal(dispatchedEvents.length, 1)
    assert.deepEqual(dispatchedEvents[0].detail, {
      message: 'Saved.',
      type: 'success',
      duration: 2500,
    })
  } finally {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = originalCustomEvent
  }
})
