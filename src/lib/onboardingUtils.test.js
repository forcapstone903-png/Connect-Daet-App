const test = require('node:test')
const assert = require('node:assert/strict')
const { getRequiredSelectionCount, getOnboardingStepMeta } = require('./onboardingUtils')

test('required selection count caps at the number of available options', () => {
  assert.equal(getRequiredSelectionCount(10, 3), 3)
  assert.equal(getRequiredSelectionCount(2, 3), 2)
  assert.equal(getRequiredSelectionCount(0, 3), 3)
})

test('step metadata includes the expected onboarding labels and styling', () => {
  const stepOne = getOnboardingStepMeta(1)
  assert.equal(stepOne.kicker, 'Start your Daet story')
  assert.equal(stepOne.accent, 'sky')
  assert.equal(stepOne.nextLabel, 'Next')

  const stepFour = getOnboardingStepMeta(4)
  assert.equal(stepFour.kicker, 'Make it personal')
  assert.equal(stepFour.accent, 'violet')
  assert.equal(stepFour.nextLabel, 'Finish setup')
})
