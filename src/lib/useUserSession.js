import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getAuthCookieFromDocument } from './authCookies'
import { performLogout } from './clientLogout'

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
      await performLogout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    window.location.href = '/info/login'
  }, [])

  return { session, loading, logout }
}