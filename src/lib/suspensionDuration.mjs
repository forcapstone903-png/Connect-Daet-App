export const DAYS_PER_SUSPENSION_MONTH = 30
export const MAX_SUSPENSION_DURATION_DAYS = 365

export function getTotalSuspensionDays(monthsValue, daysValue) {
  const months = monthsValue === '' || monthsValue == null ? 0 : Number(monthsValue)
  const days = daysValue === '' || daysValue == null ? 0 : Number(daysValue)

  if (!Number.isInteger(months) || months < 0 || months > 12) return null
  if (!Number.isInteger(days) || days < 0 || days >= DAYS_PER_SUSPENSION_MONTH) return null

  const totalDays = months * DAYS_PER_SUSPENSION_MONTH + days
  return totalDays >= 1 && totalDays <= MAX_SUSPENSION_DURATION_DAYS ? totalDays : null
}

export function splitSuspensionDays(totalDaysValue) {
  const totalDays = Number(totalDaysValue)
  if (!Number.isInteger(totalDays) || totalDays < 1 || totalDays > MAX_SUSPENSION_DURATION_DAYS) {
    return { months: '0', days: '7' }
  }
  return {
    months: String(Math.floor(totalDays / DAYS_PER_SUSPENSION_MONTH)),
    days: String(totalDays % DAYS_PER_SUSPENSION_MONTH),
  }
}

export function formatSuspensionDuration(totalDaysValue) {
  const totalDays = Number(totalDaysValue)
  if (!Number.isInteger(totalDays) || totalDays < 1) return '—'
  const months = Math.floor(totalDays / DAYS_PER_SUSPENSION_MONTH)
  const days = totalDays % DAYS_PER_SUSPENSION_MONTH
  const parts = []
  if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`)
  if (days || !months) parts.push(`${days || totalDays} day${(days || totalDays) === 1 ? '' : 's'}`)
  return parts.join(' and ')
}
