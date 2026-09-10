const FALLBACK_TOPICS = ['Beaches', 'Food', 'History', 'Culture', 'Events', 'Nature']
const FALLBACK_PLACES = ['Bagasbas Beach', 'Daet Elevated Town Plaza', 'First Rizal Monument', 'Morga House', 'Vinzons Watersports']

function getRequiredSelectionCount(totalOptions, minimumRequired) {
  if (!Number.isFinite(totalOptions) || totalOptions <= 0) {
    return minimumRequired
  }

  return Math.min(minimumRequired, totalOptions)
}

function getOnboardingStepMeta(step) {
  const mapping = {
    1: {
      kicker: 'Start your Daet story',
      title: 'Choose your interests',
      accent: 'sky',
      nextLabel: 'Next',
    },
    2: {
      kicker: 'Explore local favorites',
      title: 'Pick your go-to places',
      accent: 'emerald',
      nextLabel: 'Next',
    },
    3: {
      kicker: 'Find your people',
      title: 'Follow local voices',
      accent: 'amber',
      nextLabel: 'Continue',
    },
    4: {
      kicker: 'Make it personal',
      title: 'Add your profile details',
      accent: 'violet',
      nextLabel: 'Finish setup',
    },
  }

  return mapping[step] || mapping[1]
}

module.exports = {
  FALLBACK_TOPICS,
  FALLBACK_PLACES,
  getRequiredSelectionCount,
  getOnboardingStepMeta,
}
