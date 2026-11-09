// Keep optional titles in the existing review_text column without changing the database schema.
const TITLE_PREFIX = '[[connectdaet-review-title:'
const BODY_SEPARATOR = ']]\n'

export function encodeReviewText(title, body) {
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  const cleanBody = typeof body === 'string' ? body.trim() : ''

  return cleanTitle
    ? `${TITLE_PREFIX}${cleanTitle.length}:${cleanTitle}${BODY_SEPARATOR}${cleanBody}`
    : cleanBody
}

export function decodeReviewText(value) {
  if (typeof value !== 'string' || !value.startsWith(TITLE_PREFIX)) {
    return { title: '', body: value || '' }
  }

  const lengthSeparator = value.indexOf(':', TITLE_PREFIX.length)
  if (lengthSeparator < 0) return { title: '', body: value }

  const titleLength = Number(value.slice(TITLE_PREFIX.length, lengthSeparator))
  const titleStart = lengthSeparator + 1
  const titleEnd = titleStart + titleLength

  if (!Number.isInteger(titleLength) || titleLength < 0 || value.slice(titleEnd, titleEnd + BODY_SEPARATOR.length) !== BODY_SEPARATOR) {
    return { title: '', body: value }
  }

  return {
    title: value.slice(titleStart, titleEnd),
    body: value.slice(titleEnd + BODY_SEPARATOR.length),
  }
}
