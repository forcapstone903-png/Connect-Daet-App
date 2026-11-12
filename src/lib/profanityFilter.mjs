const MAX_TERMS = 250
const MAX_TERM_LENGTH = 40
const TERM_PATTERN = /^[A-Za-z0-9_]+$/

export function normalizeProfanityTerms(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Profanity terms must be provided as a list.')
  }
  if (value.length > MAX_TERMS) {
    throw new RangeError(`Use no more than ${MAX_TERMS} profanity terms.`)
  }

  const terms = []
  const seen = new Set()
  for (const rawTerm of value) {
    const term = String(rawTerm || '').trim().toLowerCase()
    if (!term) continue
    if (term.length > MAX_TERM_LENGTH || !TERM_PATTERN.test(term)) {
      throw new TypeError('Each profanity term must be 1-40 letters, numbers, or underscores.')
    }
    if (seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }

  return terms
}

export function findProfanityMatches(text, terms) {
  const tokens = new Set(String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || [])
  return normalizeProfanityTerms(terms).filter((term) => tokens.has(term))
}
