export function normalizeMentionName(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

export function parseMentionCandidates(text = '') {
  if (!text || typeof text !== 'string') return []

  const candidates = []
  const pattern = /(^|\s)(@[A-Za-z0-9][A-Za-z0-9.'-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.'-]*)*)/g
  let match

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[2]
    const words = raw.slice(1).trim().split(/\s+/)
    for (let length = words.length; length >= 1; length -= 1) {
      const displayName = words.slice(0, length).join(' ')
      const start = match.index + match[1].length
      candidates.push({
        displayName,
        normalizedName: normalizeMentionName(displayName),
        start,
        end: start + displayName.length,
      })
    }
  }

  return candidates
}

export function renderMentionText(text = '', mentions = []) {
  const resolvedMentions = (mentions || [])
    .filter((mention) => mention?.display_name && mention?.mentioned_user_id)
    .map((mention) => ({
      ...mention,
      normalizedName: normalizeMentionName(mention.display_name),
    }))
    .sort((a, b) => b.display_name.length - a.display_name.length)

  if (!resolvedMentions.length || !text) return [{ type: 'text', value: text }]

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const mentionPattern = resolvedMentions.map((mention) => escapeRegExp(mention.display_name)).join('|')
  const parts = []
  let cursor = 0
  const pattern = new RegExp(`(^|\\s)(@(?:${mentionPattern}))(?=\\s|$|[.!?,])`, 'gi')
  let match

  while ((match = pattern.exec(text)) !== null) {
    const tokenStart = match.index + match[1].length
    const token = match[2]
    const normalizedToken = normalizeMentionName(token.slice(1))
    const mention = resolvedMentions.find((candidate) => normalizedToken === candidate.normalizedName)
    if (!mention) continue

    if (tokenStart > cursor) parts.push({ type: 'text', value: text.slice(cursor, tokenStart) })
    parts.push({ type: 'mention', value: token, userId: mention.mentioned_user_id })
    cursor = tokenStart + token.length
  }

  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) })
  return parts.length ? parts : [{ type: 'text', value: text }]
}
