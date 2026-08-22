import { useState, useEffect, useCallback } from 'react'
import { getAuthCookieFromDocument } from './authCookies'

export function useUserSession() {
  // Lazy initialization for session - reads cookie synchronously on first render
  const [session, setSession] = useState(() => {
    if (typeof window === 'undefined') return null
    return getAuthCookieFromDocument()
  })
  const [loading, setLoading] = useState(() => typeof window === 'undefined')

  useEffect(() => {
    // Cookie may have changed since initial mount (e.g. after login/logout)
    const sessionData = getAuthCookieFromDocument()
    setSession(sessionData)
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    try {
      // Call logout API
      await fetch('/api/logout', { method: 'POST' })
      
      // Clear session storage
      sessionStorage.removeItem('user_session')
      
      // Redirect to login
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = '/login'
    }
  }, [])

  return { session, loading, logout }
}