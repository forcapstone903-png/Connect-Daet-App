// lib/errorMessage.js
// Shared helpers that turn error objects (especially Supabase/PostgREST errors,
// which can arrive as nearly-empty {} objects) into readable, actionable messages.

export function getErrorMessage(err) {
  if (!err) return 'Unknown error'
  if (typeof err === 'string') return err

  const message = typeof err.message === 'string' ? err.message.trim() : ''
  const code = typeof err.code === 'string' ? err.code.trim() : ''
  const details = typeof err.details === 'string' ? err.details.trim() : ''
  const hint = typeof err.hint === 'string' ? err.hint.trim() : ''

  const parts = []
  if (message) parts.push(message)
  if (details) parts.push(`Details: ${details}`)
  if (hint) parts.push(hint)
  if (code) parts.push(`[${code}]`)

  const output = parts.length > 0 ? parts.join(' ') : 'Database operation failed (table may not exist or RLS may be blocking)'

  if (isMissingTableError(err)) {
    return `${output} Apply the social features migration (supabase/migrations/004_social_features.sql) to create this table, then reload the page.`
  }

  return output
}

export function isMissingTableError(err) {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  if (typeof err.message === 'string' && err.message.includes('Could not find the table')) return true
  return false
}