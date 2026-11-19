const MAX_RISK_SCORE = 100

export function classifyModerationRisk(score) {
  const normalizedScore = Number.isFinite(Number(score))
    ? Math.max(0, Math.min(MAX_RISK_SCORE, Math.round(Number(score))))
    : MAX_RISK_SCORE

  if (normalizedScore >= 70) return 'high'
  if (normalizedScore >= 30) return 'medium'
  return 'low'
}

export function scoreModerationSignals(signals = {}) {
  const flags = new Set()
  let score = 0

  const addRisk = (flag, points) => {
    flags.add(flag)
    score += points
  }

  if (signals.criticalViolation || signals.mediaScan?.critical) addRisk('critical_policy_signal', 100)

  const configuredTermMatches = Math.max(0, Number(signals.configuredTermMatches) || 0)
  if (configuredTermMatches) addRisk('configured_language', Math.min(45, configuredTermMatches * 20))

  const suspiciousLinks = Math.max(0, Number(signals.suspiciousLinks) || 0)
  if (suspiciousLinks) addRisk('suspicious_links', Math.min(45, suspiciousLinks * 15))

  if (signals.duplicateContent) addRisk('duplicate_content', 45)

  const recentSubmissions = Math.max(0, Number(signals.recentSubmissions) || 0)
  if (recentSubmissions >= 3) addRisk('rapid_posting', Math.min(40, 15 + (recentSubmissions - 3) * 10))

  const validReports = Math.max(0, Number(signals.validReports) || 0)
  if (validReports) addRisk('community_reports', Math.min(50, validReports * 15))

  const previousRejections = Math.max(0, Number(signals.previousRejections) || 0)
  if (previousRejections) addRisk('previous_rejections', Math.min(30, previousRejections * 10))

  const previousViolations = Math.max(0, Number(signals.previousViolations) || 0)
  if (previousViolations) addRisk('previous_violations', Math.min(50, previousViolations * 25))

  if (signals.mediaScan?.available === false) {
    flags.add('media_scan_unavailable')
    score = Math.max(score, 30)
  } else if (signals.mediaScan?.safe === false) {
    addRisk('media_flagged', Math.max(30, Math.min(80, Number(signals.mediaScan.score) || 30)))
  } else if (Number.isFinite(Number(signals.mediaScan?.score)) && Number(signals.mediaScan.score) > 0) {
    addRisk('media_risk', Math.min(40, Math.round(Number(signals.mediaScan.score) * 0.4)))
  }
  if (signals.mediaScan?.flags?.length) {
    addRisk('media_scan_flags', Math.min(30, 15 + signals.mediaScan.flags.length * 5))
    for (const flag of signals.mediaScan.flags.slice(0, 20)) flags.add(`media:${flag}`)
  }

  if (signals.checkUnavailable) {
    flags.add('moderation_check_unavailable')
    score = Math.max(score, 30)
  }

  const normalizedScore = Math.min(MAX_RISK_SCORE, score)
  return {
    score: normalizedScore,
    level: signals.criticalViolation || signals.mediaScan?.critical ? 'high' : classifyModerationRisk(normalizedScore),
    flags: [...flags],
    requiresHumanReview: Boolean(
      signals.criticalViolation
      || signals.mediaScan?.critical
      || signals.checkUnavailable
      || signals.mediaScan?.available === false
      || signals.mediaScan?.safe === false
      || normalizedScore >= 30
    ),
  }
}

export function getAutoPublishEligibility({ risk, history, policy }) {
  const requirements = {
    enabled: policy?.enabled === true,
    lowRisk: risk?.level === 'low' && Number(risk.score) < 30,
    noCriticalSignals: !risk?.criticalViolation,
    allChecksPassed: risk?.checksPassed === true,
    accountAge: Number(history?.accountAgeDays) >= Number(policy?.minAccountAgeDays ?? 7),
    approvedPosts: Number(history?.approvedPosts) >= Number(policy?.minApprovedPosts ?? 3),
    rejectionLimit: Number(history?.rejectedPosts) <= Number(policy?.maxRejectedPosts ?? 0),
    violationLimit: Number(history?.violations) <= Number(policy?.maxViolations ?? 0),
    postingRate: Number(history?.recentSubmissions) <= Number(policy?.maxRecentSubmissions ?? 2),
    noValidReports: Number(history?.validReports) === 0,
  }

  return {
    eligible: Object.values(requirements).every(Boolean),
    requirements,
  }
}

export function prioritizeModerationQueue(items = []) {
  const priority = (item) => {
    const flags = Array.isArray(item.moderation_flags) ? item.moderation_flags : []
    const reports = Number(item.valid_report_count) || 0
    if (item.risk_level === 'high' || flags.includes('critical_policy_signal')) return 0
    if (reports > 1) return 1
    if (item.risk_level === 'medium') return 2
    return 3
  }

  return [...items].sort((a, b) => (
    priority(a) - priority(b)
    || Date.parse(a.submitted_at || a.created_at || 0) - Date.parse(b.submitted_at || b.created_at || 0)
  ))
}