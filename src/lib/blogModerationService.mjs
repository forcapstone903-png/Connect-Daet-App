import {
  getAutoPublishEligibility,
  scoreModerationSignals,
} from './moderationWorkflow.mjs'

const MEDIA_SCAN_TIMEOUT_MS = 8000
const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'is.gd',
  'buff.ly',
])

function stripMarkup(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeText(value) {
  return stripMarkup(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function getTermMatchCount(text, terms) {
  const normalizedText = normalizeText(text)
  return terms.reduce((count, term) => {
    const normalizedTerm = normalizeText(term)
    if (!normalizedTerm) return count
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = normalizedText.match(new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'g'))
    return count + (matches?.length || 0)
  }, 0)
}

function hasCriticalThreat(text, criticalTerms) {
  const normalized = normalizeText(text)
  const threatPattern = /\b(?:i will|i am going to|i'm going to|we will|we are going to)\s+(?:kill|shoot|bomb|attack|hurt)\b/
  return threatPattern.test(normalized) || getTermMatchCount(normalized, criticalTerms) > 0
}

function getSuspiciousLinkCount(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s"'<>]+/gi) || []
  return urls.reduce((count, rawUrl) => {
    try {
      const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '')
      return count + (SHORTENER_HOSTS.has(host) ? 1 : 0)
    } catch {
      return count + 1
    }
  }, Math.max(0, urls.length - 2))
}

function isNearDuplicate(candidate, existing) {
  const normalizedCandidate = normalizeText(candidate)
  if (normalizedCandidate.length < 40) return false
  for (const row of existing) {
    const normalizedExisting = normalizeText(`${row.title || ''} ${row.content || ''}`)
    if (normalizedExisting === normalizedCandidate) return true
    if (normalizedExisting.length < 40) continue
    const candidateWords = new Set(normalizedCandidate.split(' '))
    const existingWords = new Set(normalizedExisting.split(' '))
    let common = 0
    for (const word of candidateWords) {
      if (existingWords.has(word)) common += 1
    }
    const union = new Set([...candidateWords, ...existingWords]).size
    if (union && common / union >= 0.92) return true
  }
  return false
}

function validateMediaScanResult(result) {
  if (!result || typeof result.safe !== 'boolean'
    || !Number.isFinite(Number(result.score))
    || Number(result.score) < 0
    || Number(result.score) > 100
    || (result.critical !== undefined && typeof result.critical !== 'boolean')
    || (result.flags !== undefined && (!Array.isArray(result.flags) || result.flags.some((flag) => typeof flag !== 'string')))) {
    throw new Error('Moderation media scanner returned an invalid response.')
  }
  return {
    available: true,
    safe: result.safe,
    score: Math.round(Number(result.score)),
    critical: result.critical === true,
    flags: (result.flags || []).slice(0, 30),
    reason: typeof result.reason === 'string' ? result.reason.slice(0, 1000) : '',
  }
}

async function scanMedia(blog) {
  const urls = [
    blog.featured_image,
    ...(Array.isArray(blog.images) ? blog.images : []),
    ...(Array.isArray(blog.videos) ? blog.videos : []),
  ].filter((url) => typeof url === 'string' && url.trim())
  if (!urls.length) return { available: true, safe: true, score: 0, flags: [] }

  const endpoint = process.env.CONTENT_MODERATION_API_URL?.trim()
  const apiKey = process.env.CONTENT_MODERATION_API_KEY?.trim()
  if (!endpoint || !apiKey) {
    return {
      available: false,
      safe: false,
      score: 0,
      flags: ['media_scan_unavailable'],
      reason: 'Media scanning is not configured; media submissions require human review.',
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), MEDIA_SCAN_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: blog.title,
        text: stripMarkup(blog.content),
        media: urls.map((url) => ({ url, kind: /\.(mp4|mov|webm)(?:[?#]|$)/i.test(url) ? 'video' : 'image' })),
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Media scanner returned HTTP ${response.status}.`)
    return validateMediaScanResult(await response.json())
  } finally {
    clearTimeout(timeout)
  }
}

function defaultAutoPublishPolicy(settings) {
  const configured = settings && typeof settings === 'object' ? settings.autoPublish : null
  return {
    enabled: configured?.enabled === true,
    minAccountAgeDays: Math.max(0, Number(configured?.minAccountAgeDays ?? 7)),
    minApprovedPosts: Math.max(0, Number(configured?.minApprovedPosts ?? 3)),
    maxRejectedPosts: Math.max(0, Number(configured?.maxRejectedPosts ?? 0)),
    maxViolations: Math.max(0, Number(configured?.maxViolations ?? 0)),
    maxRecentSubmissions: Math.max(0, Number(configured?.maxRecentSubmissions ?? 2)),
  }
}

function getReadableReason(risk, mediaScan) {
  if (risk.flags.includes('critical_policy_signal')) return 'A critical safety signal requires priority human review.'
  if (risk.flags.includes('moderation_check_unavailable')) return 'A required moderation check was unavailable; the post was held for review.'
  if (risk.flags.includes('media_scan_unavailable')) return mediaScan.reason
  if (risk.flags.length) return `Automated checks flagged: ${risk.flags.join(', ')}.`
  return 'Automated checks passed; this account does not yet meet the configured auto-publishing requirements.'
}

async function executeQuery(query, label) {
  const result = await query
  if (result.error) {
    const error = new Error(`${label}: ${result.error.message || 'database request failed'}`)
    error.cause = result.error
    throw error
  }
  return result
}

async function getModerationInputs(client, blog) {
  const [settingsResult, contextResult, duplicateResult] = await Promise.all([
    executeQuery(client.from('admin_app_settings').select('value').eq('id', 'moderation').maybeSingle(), 'Moderation settings lookup failed'),
    executeQuery(client.rpc('get_blog_moderation_context', { p_blog_id: blog.id }), 'Author history lookup failed'),
    executeQuery(client.from('info_blogs').select('title, content').in('approval_status', ['pending', 'approved']).neq('id', blog.id).order('created_at', { ascending: false }).limit(200), 'Duplicate-content lookup failed'),
  ])
  if (!contextResult.data) throw new Error('Author moderation context is unavailable.')

  return {
    settings: settingsResult.data?.value || {},
    history: contextResult.data,
    duplicateContent: isNearDuplicate(`${blog.title || ''} ${blog.content || ''}`, duplicateResult.data || []),
  }
}

export async function processBlogModeration(client, blogId, { forcedReviewReason = '' } = {}) {
  const { data: claim, error: claimError } = await client.rpc('claim_blog_moderation', { p_blog_id: blogId })
  if (claimError) throw claimError
  if (!claim?.claimed || !claim.blog) return { processed: false, alreadyProcessed: true }

  const blog = claim.blog
  let score = {
    score: 30,
    level: 'medium',
    flags: ['moderation_check_unavailable'],
    requiresHumanReview: true,
  }
  let reason = 'A required moderation check was unavailable; the post was held for review.'
  let failed = false
  let autoPublish = false
  let details = {}

  if (forcedReviewReason) {
    failed = true
    score = {
      score: 30,
      level: 'medium',
      flags: ['moderation_check_unavailable', 'media_scan_unavailable'],
      requiresHumanReview: true,
    }
    reason = forcedReviewReason
    details = { checkFailure: 'Submission media could not be verified as stored.' }
  } else try {
    const [inputs, mediaScan] = await Promise.all([
      getModerationInputs(client, blog),
      scanMedia(blog),
    ])
    const settings = inputs.settings?.moderation && typeof inputs.settings.moderation === 'object'
      ? inputs.settings.moderation
      : inputs.settings
    const terms = Array.isArray(settings?.profanityTerms) ? settings.profanityTerms : []
    const criticalTerms = Array.isArray(settings?.criticalTerms) ? settings.criticalTerms : []
    const combinedText = `${blog.title || ''} ${blog.content || ''}`
    const configuredTermMatches = getTermMatchCount(combinedText, terms)
    const criticalViolation = hasCriticalThreat(combinedText, criticalTerms)
    const linkCount = getSuspiciousLinkCount(combinedText)

    score = scoreModerationSignals({
      criticalViolation,
      configuredTermMatches,
      suspiciousLinks: linkCount,
      duplicateContent: inputs.duplicateContent,
      recentSubmissions: inputs.history.recentSubmissions,
      validReports: inputs.history.validReports,
      previousRejections: inputs.history.rejectedPosts,
      previousViolations: inputs.history.violations,
      mediaScan,
    })
    const checksPassed = score.flags.length === 0
      && mediaScan.available
      && mediaScan.safe
      && !criticalViolation
    const eligibility = getAutoPublishEligibility({
      risk: { ...score, criticalViolation: criticalViolation || mediaScan.critical, checksPassed },
      history: inputs.history,
      policy: defaultAutoPublishPolicy(settings),
    })
    autoPublish = eligibility.eligible && !score.requiresHumanReview
    reason = getReadableReason(score, mediaScan)
    details = {
      accountAgeDays: inputs.history.accountAgeDays,
      approvedPosts: inputs.history.approvedPosts,
      rejectedPosts: inputs.history.rejectedPosts,
      violations: inputs.history.violations,
      recentSubmissions: inputs.history.recentSubmissions,
      validReports: inputs.history.validReports,
      duplicateContent: inputs.duplicateContent,
      mediaScan: { available: mediaScan.available, safe: mediaScan.safe, flags: mediaScan.flags },
      autoPublishRequirements: eligibility.requirements,
    }
  } catch (error) {
    failed = true
    score = {
      score: Math.max(30, score.score || 0),
      level: 'medium',
      flags: [...new Set([...(score.flags || []), 'moderation_check_unavailable'])],
      requiresHumanReview: true,
    }
    reason = 'A required moderation check failed; the post remains unpublished for administrator review.'
    details = { checkFailure: error?.message || 'Unknown moderation check failure.' }
    console.error('Blog moderation check failed:', error)
  }

  const { data: result, error: completeError } = await client.rpc('complete_blog_moderation', {
    p_blog_id: blogId,
    p_risk_score: score.score,
    p_risk_level: score.level,
    p_flags: score.flags,
    p_reason: reason,
    p_auto_publish: autoPublish,
    p_check_failed: failed,
    p_details: details,
  })
  if (completeError) throw completeError
  return { processed: Boolean(result?.completed), ...result }
}
