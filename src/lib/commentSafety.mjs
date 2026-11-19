import sanitizeHtml from 'sanitize-html'
import { clientIp, consumeRateLimit } from './rateLimit.js'

export const MAX_COMMENT_LENGTH = 5000

export function sanitizeCommentContent(value) {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .trim()
}

export function hasCriticalCommentSafetySignal(content, rawTerms = []) {
  const normalized = sanitizeCommentContent(content)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  const threatPattern = /(?:^|\s)(?:i will|i am going to|i m going to|we will|we are going to)\s+(?:kill|shoot|bomb|attack|hurt)(?=\s|$)/
  if (threatPattern.test(normalized)) return true

  const terms = Array.isArray(rawTerms)
    ? rawTerms.filter((term) => typeof term === 'string').slice(0, 250)
    : []
  return terms.some((term) => {
    const normalizedTerm = term.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!normalizedTerm) return false
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`).test(normalized)
  })
}

export async function hasConfiguredCriticalCommentSafetySignal(client, content) {
  const { data, error } = await client
    .from('admin_app_settings')
    .select('value')
    .eq('id', 'moderation')
    .maybeSingle()
  if (error) throw error

  const settings = data?.value?.moderation && typeof data.value.moderation === 'object'
    ? data.value.moderation
    : data?.value || {}
  const terms = Array.isArray(settings.criticalTerms) ? settings.criticalTerms : []
  return hasCriticalCommentSafetySignal(content, terms)
}

export async function checkCommentRateLimit(client, request, userId) {
  const results = await Promise.all([
    consumeRateLimit(client, {
      scope: 'comment-user',
      key: userId,
      max: 10,
      windowSeconds: 600,
    }),
    consumeRateLimit(client, {
      scope: 'comment-ip',
      key: clientIp(request),
      max: 60,
      windowSeconds: 3600,
    }),
  ])

  if (results.some((result) => result.unavailable)) {
    return { allowed: false, status: 503, message: 'Comment posting is temporarily unavailable.' }
  }
  if (results.some((result) => !result.allowed)) {
    return { allowed: false, status: 429, message: 'You are commenting too quickly. Please try again later.' }
  }
  return { allowed: true }
}
