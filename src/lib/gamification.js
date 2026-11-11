const POINT_REWARDS = Object.freeze({
  COMMENT: 0.01,
  APPROVED_POST: 10,
})

function getLevelFromPoints(points = 0) {
  if (points >= 2500) return 6
  if (points >= 1500) return 5
  if (points >= 800) return 4
  if (points >= 350) return 3
  if (points >= 120) return 2
  return 1
}

function getLevelProgress(points = 0) {
  if (points <= 0) return 0
  if (points < 120) return Math.min(100, Math.round((points / 120) * 100))
  if (points < 350) return Math.min(100, Math.max(20, Math.round(20 + ((points - 120) / (350 - 120)) * 80)))
  if (points < 800) return 100
  if (points < 1500) return Math.min(100, Math.round((points / 1500) * 100))
  if (points < 2500) return Math.min(100, Math.round((points / 2500) * 100))

  return 100
}

function getDailyStreak(dates = []) {
  const unique = [...new Set(dates.filter(Boolean))].sort((a, b) => new Date(a) - new Date(b))
  if (!unique.length) {
    return { current: 0, longest: 0 }
  }

  let longest = 1
  let current = 1
  let previousDate = null

  for (const entry of unique) {
    const date = new Date(entry)
    if (Number.isNaN(date.getTime())) continue

    if (previousDate) {
      const diffDays = Math.round((date.getTime() - previousDate.getTime()) / 86400000)
      if (diffDays === 1) {
        current += 1
        longest = Math.max(longest, current)
      } else if (diffDays > 1) {
        current = 1
      }
    }

    previousDate = date
  }

  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10)
  const hasToday = unique.includes(todayKey)
  const hasYesterday = unique.includes(yesterday)

  const activeCurrent = hasToday || (hasYesterday && unique.includes(yesterday)) ? current : 0

  return { current: activeCurrent || 1, longest }
}

function getRewardBadges(points = 0, milestones = [
  { name: 'First Visit', description: 'Joined the community', points: 0 },
  { name: 'Explorer', description: 'Reach 120 points', points: 120 },
  { name: 'Top Contributor', description: 'Reach 350 points', points: 350 },
  { name: 'Community Guide', description: 'Reach 800 points', points: 800 },
  { name: 'Local Legend', description: 'Reach 1,500 points', points: 1500 },
]) {
  return milestones
    .filter((milestone) => points >= milestone.points)
    .map(({ name, description }) => ({ name, description }))
}

module.exports = {
  POINT_REWARDS,
  getLevelFromPoints,
  getLevelProgress,
  getDailyStreak,
  getRewardBadges,
}
