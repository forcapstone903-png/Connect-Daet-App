const MAX_TERMS = 250
const MAX_TOTAL_TERM_LENGTH = 10000
const MAX_MASKED_CHARACTERS = 3
const NUMBER_SUBSTITUTIONS = Object.freeze({
  0: 'o',
  1: 'i',
  2: 'z',
  3: 'e',
  4: 'a',
  5: 's',
  6: 'g',
  7: 't',
  8: 'b',
  9: 'g',
})

function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[0-9]/g, (digit) => NUMBER_SUBSTITUTIONS[digit])
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/(\p{L})\1+/gu, '$1')
}

function normalizeProfanityTerm(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean)
    .join(' ')
}

function matchesMaskedToken(term, rawToken) {
  let maskedToken = ''
  let previousWasSymbol = false

  for (const rawCharacter of String(rawToken || '').toLowerCase()) {
    const character = NUMBER_SUBSTITUTIONS[rawCharacter] || rawCharacter
    if (/[\p{L}\p{N}_]/u.test(character)) {
      const previousCharacter = maskedToken[maskedToken.length - 1]
      if (!(character === previousCharacter && /\p{L}/u.test(character) && !previousWasSymbol)) {
        maskedToken += character
      }
      previousWasSymbol = false
    } else if (maskedToken && !previousWasSymbol) {
      maskedToken += '?'
      previousWasSymbol = true
    } else {
      previousWasSymbol = true
    }
  }

  maskedToken = maskedToken.replace(/\?+$/, '')
  if (!maskedToken.includes('?')) return false

  let termIndex = 0
  let maskedCharacters = 0
  for (const character of maskedToken) {
    if (character === '?') {
      termIndex += 1
      maskedCharacters += 1
      if (maskedCharacters > MAX_MASKED_CHARACTERS) return false
    } else if (term[termIndex] === character) {
      termIndex += 1
    } else {
      return false
    }
  }

  return termIndex === term.length
}

export function normalizeProfanityTerms(value) {
  if (!Array.isArray(value)) {
    throw new TypeError('Profanity terms must be provided as a list.')
  }
  if (value.length > MAX_TERMS) {
    throw new RangeError(`Use no more than ${MAX_TERMS} profanity terms.`)
  }

  const terms = []
  const seen = new Set()
  let totalLength = 0
  for (const rawTerm of value) {
    if (typeof rawTerm !== 'string') {
      throw new TypeError('Each profanity term must be text.')
    }

    const raw = rawTerm.trim()
    if (!raw) continue
    totalLength += raw.length + (terms.length ? 1 : 0)
    if (totalLength > MAX_TOTAL_TERM_LENGTH) {
      throw new RangeError(`The profanity term list cannot exceed ${MAX_TOTAL_TERM_LENGTH} characters.`)
    }

    const term = normalizeProfanityTerm(raw)
    if (!term) {
      throw new TypeError('Each profanity term must contain at least one letter or number.')
    }
    if (seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }

  return terms
}

export function findProfanityMatches(text, terms) {
  const content = String(text || '')
  const whitespaceTokens = content.split(/\s+/).filter(Boolean).map((rawToken) => ({
    value: normalizeWord(rawToken),
    raw: rawToken,
  }))
  const unicodeTokens = content.match(/[\p{L}\p{N}_]+/gu) || []
  const punctuationTokens = unicodeTokens.map((rawToken) => ({
    value: normalizeWord(rawToken),
    raw: rawToken,
  }))
  const tokenSets = [
    whitespaceTokens,
    punctuationTokens,
  ]

  return normalizeProfanityTerms(terms).filter((term) => {
    const termWords = term.split(' ')
    return tokenSets.some((tokens) => {
      if (tokens.length < termWords.length) return false

      for (let start = 0; start <= tokens.length - termWords.length; start += 1) {
        const matches = termWords.every((word, offset) => {
          const token = tokens[start + offset]
          return token.value === word || matchesMaskedToken(word, token.raw)
        })
        if (matches) return true
      }

      return false
    })
  })
}
