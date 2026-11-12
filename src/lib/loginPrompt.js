// Login link for a guest who tried a members-only action: explains why and
// returns them to the current page afterwards (the login page only accepts
// same-site /info/visitor and /info/user return paths).
export function loginUrlFor(message) {
  const params = new URLSearchParams({ message })
  if (typeof window !== 'undefined') {
    params.set('redirect', `${window.location.pathname}${window.location.search}`)
  }
  return `/info/login?${params.toString()}`
}
