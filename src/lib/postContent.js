const ATTACHMENTS_MARKER = /\battachments?\s*:/i
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi
const IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i

function extractAttachmentUrls(value) {
  return [...String(value || '').matchAll(URL_PATTERN)]
    .map((match) => match[0].replace(/[),!?;]+$/, ''))
    .filter((value) => {
      try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:'
      } catch {
        return false
      }
    })
}

function parsePostContent(value) {
  const content = String(value || '').trim()
  const marker = ATTACHMENTS_MARKER.exec(content)
  if (!marker) return { text: content, attachments: [] }

  const text = content.slice(0, marker.index).trim()
  const attachments = extractAttachmentUrls(content.slice(marker.index + marker[0].length))
  return attachments.length ? { text, attachments } : { text: content, attachments: [] }
}

function getPostPreview(value, maxLength = 180) {
  const { text, attachments } = parsePostContent(value)
  const compactText = text.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim()
  const limit = Math.max(1, Number(maxLength) || 180)
  const preview = compactText.length > limit
    ? `${compactText.slice(0, limit).trimEnd()}…`
    : compactText
  const attachmentLabel = attachments.length
    ? `${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`
    : ''

  return [preview, attachmentLabel].filter(Boolean).join(' · ')
}

function isImageAttachment(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && IMAGE_EXTENSION_PATTERN.test(url.pathname)
  } catch {
    return false
  }
}

module.exports = { getPostPreview, parsePostContent, isImageAttachment }
