// What an API may show a user about a failure. Messages the app throws itself
// (plain Error with a readable sentence) pass through; database, PostgREST,
// Supabase Auth and network errors are replaced by the fallback so table,
// column, constraint or provider details never reach the browser. Callers
// should still console.error the original error for debugging.
const INTERNAL_PATTERN = /relation|column|violates|constraint|syntax|permission denied|row-level security|jwt|pgrst|duplicate key|does not exist|fetch failed|econn|timeout|schema|sql|supabase|postgres/i

export function publicErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return INTERNAL_PATTERN.test(error) ? fallback : error
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  const fromDatabaseOrProvider = typeof error.code === 'string'
    || error.details !== undefined
    || error.hint !== undefined
    || error.status !== undefined
  if (!message || fromDatabaseOrProvider || message.length > 200 || INTERNAL_PATTERN.test(message)) return fallback
  return message
}
