import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getAuthCookieFromDocument } from './authCookies'

const subscribeToCookie = () => () => {}
const getServerCookieSnapshot = () => null
const getClientLoadingSnapshot = () => false
const getServerLoadingSnapshot = () => true

export function useUserSession() {
  const rawSession = useSyncExternalStore(
    subscribeToCookie,
    () => {
      const session = getAuthCookieFromDocument()
      return session ? JSON.stringify(session) : null
    },
    getServerCookieSnapshot
  )
  const session = useMemo(() => rawSession ? JSON.parse(rawSession) : null, [rawSession])
  const loading = useSyncExternalStore(subscribeToCookie, getClientLoadingSnapshot, getServerLoadingSnapshot)

  const logout = useCallback(async () => {
    try {
      // Call logout API
      await fetch('/info/api/logout', { method: 'POST' })
      
      // Clear session storage
      sessionStorage.removeItem('user_session')
      
      // Redirect to login
      window.location.href = '/info/login'
    } catch (error) {
      console.error('Logout error:', error)
      window.location.href = '/info/login'
    }
  }, [])

  return { session, loading, logout }
}