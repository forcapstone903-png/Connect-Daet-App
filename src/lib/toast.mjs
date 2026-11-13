export const TOAST_EVENT = 'daet-toast'
export const TOAST_TYPES = ['success', 'error', 'warning', 'info']

export function inferToastType(message, fallback = 'info') {
  const text = String(message || '').toLowerCase()

  if (/\b(pending|awaiting|for approval|for review|under review|will be reviewed|rejected|please sign in|enter a|select a)\b/.test(text)) {
    return 'warning'
  }
  if (/\b(error|failed|unable|invalid|required|must be|could not|cannot|denied|not found)\b/.test(text)) {
    return 'error'
  }
  if (/\b(success|successfully|approved|saved|updated|submitted|published|deleted|created|sent|downloaded|copied|removed)\b/.test(text)) {
    return 'success'
  }

  return fallback
}

export function notifyToast(message, type, duration) {
  if (typeof window === 'undefined') return false

  const text = String(message ?? '').trim()
  if (!text) return false

  const resolvedType = TOAST_TYPES.includes(type) ? type : inferToastType(text)
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, {
    detail: { message: text, type: resolvedType, duration },
  }))
  return true
}
