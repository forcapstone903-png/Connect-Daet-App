export const DEFAULT_REWARD_SETTINGS = Object.freeze({
  actions: {
    approved_community_post: { label: 'Approved community post', enabled: true, points: 10 },
    approved_blog: { label: 'Approved blog post', enabled: true, points: 10 },
    comment: { label: 'Helpful comment', enabled: true, points: 0.01 },
  },
  rewards: [
    { id: 'local-food-voucher', title: 'Local food voucher', description: '', points: 500, enabled: true },
    { id: 'weekend-attraction-pass', title: 'Weekend attraction pass', description: '', points: 900, enabled: true },
    { id: 'community-souvenir-pack', title: 'Community souvenir pack', description: '', points: 1400, enabled: true },
  ],
  milestones: [
    { name: 'First Visit', description: 'Joined the community', points: 0 },
    { name: 'Explorer', description: 'Reach 120 points', points: 120 },
    { name: 'Top Contributor', description: 'Reach 350 points', points: 350 },
    { name: 'Community Guide', description: 'Reach 800 points', points: 800 },
    { name: 'Local Legend', description: 'Reach 1,500 points', points: 1500 },
  ],
})

const ACTION_KEYS = Object.keys(DEFAULT_REWARD_SETTINGS.actions)
const MAX_SETTING_BYTES = 20 * 1024

export function validateRewardSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Reward settings must be an object.' }
  }

  if (!value.actions || typeof value.actions !== 'object' || Array.isArray(value.actions)) {
    return { error: 'Point-awarding action settings are required.' }
  }

  const actions = {}
  for (const key of ACTION_KEYS) {
    const action = value.actions[key]
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return { error: `Settings for ${DEFAULT_REWARD_SETTINGS.actions[key].label.toLowerCase()} are required.` }
    }
    if (typeof action.enabled !== 'boolean') {
      return { error: `The enabled state for ${key} must be a boolean.` }
    }
    const points = Number(action.points)
    if (!Number.isFinite(points) || points < 0 || points > 1000 || Math.abs(points * 100 - Math.round(points * 100)) > 1e-8) {
      return { error: `Points for ${key} must be between 0 and 1,000 with at most two decimal places.` }
    }
    actions[key] = { ...DEFAULT_REWARD_SETTINGS.actions[key], enabled: action.enabled, points }
  }

  if (!Array.isArray(value.rewards) || value.rewards.length > 50) {
    return { error: 'Provide no more than 50 rewards.' }
  }

  const ids = new Set()
  const rewards = []
  for (const reward of value.rewards) {
    if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
      return { error: 'Each reward must be an object.' }
    }
    if (typeof reward.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(reward.id) || ids.has(reward.id)) {
      return { error: 'Each reward must have a unique valid ID.' }
    }
    if (typeof reward.title !== 'string' || !reward.title.trim() || reward.title.trim().length > 100) {
      return { error: 'Reward titles must contain 1 to 100 characters.' }
    }
    if (typeof reward.description !== 'string' || reward.description.length > 500) {
      return { error: 'Reward descriptions must be 500 characters or fewer.' }
    }
    if (typeof reward.enabled !== 'boolean') {
      return { error: `The enabled state for ${reward.title} must be a boolean.` }
    }
    const points = Number(reward.points)
    if (!Number.isInteger(points) || points < 1 || points > 1000000) {
      return { error: `The point cost for ${reward.title} must be a whole number between 1 and 1,000,000.` }
    }
    ids.add(reward.id)
    rewards.push({
      id: reward.id,
      title: reward.title.trim(),
      description: reward.description.trim(),
      points,
      enabled: reward.enabled,
    })
  }

  if (!Array.isArray(value.milestones) || value.milestones.length > 50) {
    return { error: 'Provide no more than 50 achievement milestones.' }
  }

  const milestoneNames = new Set()
  const milestones = []
  for (const milestone of value.milestones) {
    if (!milestone || typeof milestone !== 'object' || Array.isArray(milestone)) {
      return { error: 'Each achievement milestone must be an object.' }
    }
    if (typeof milestone.name !== 'string' || !milestone.name.trim() || milestone.name.trim().length > 60) {
      return { error: 'Achievement names must contain 1 to 60 characters.' }
    }
    const nameKey = milestone.name.trim().toLocaleLowerCase()
    if (milestoneNames.has(nameKey)) {
      return { error: 'Achievement names must be unique.' }
    }
    if (typeof milestone.description !== 'string' || !milestone.description.trim() || milestone.description.trim().length > 160) {
      return { error: 'Achievement descriptions must contain 1 to 160 characters.' }
    }
    const points = Number(milestone.points)
    if (!Number.isInteger(points) || points < 0 || points > 1000000) {
      return { error: 'Achievement thresholds must be whole numbers between 0 and 1,000,000.' }
    }
    milestoneNames.add(nameKey)
    milestones.push({ name: milestone.name.trim(), description: milestone.description.trim(), points })
  }

  const settings = { actions, rewards, milestones }
  if (new TextEncoder().encode(JSON.stringify(settings)).length > MAX_SETTING_BYTES) {
    return { error: 'Reward settings exceed the supported size limit.' }
  }
  return { settings }
}
