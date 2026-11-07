'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import {
  isValidAnalyticsVisitorId,
  normalizeTrackedPublicPath,
  SITE_ANALYTICS_CONSENT_KEY,
  SITE_ANALYTICS_VISITOR_KEY,
  SITE_ANALYTICS_VISITOR_TTL_MS,
} from '@/lib/siteAnalytics'

function getConsent() {
  try {
    return window.localStorage.getItem(SITE_ANALYTICS_CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

function getOrCreateVisitorId() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SITE_ANALYTICS_VISITOR_KEY) || 'null')
    if (
      isValidAnalyticsVisitorId(stored?.id)
      && Number(stored.expiresAt) > Date.now()
    ) {
      return stored.id
    }

    if (typeof window.crypto?.randomUUID !== 'function') return null

    const id = window.crypto.randomUUID()
    window.localStorage.setItem(SITE_ANALYTICS_VISITOR_KEY, JSON.stringify({
      id,
      expiresAt: Date.now() + SITE_ANALYTICS_VISITOR_TTL_MS,
    }))
    return id
  } catch {
    return null
  }
}

export default function SiteVisitTracker() {
  const pathname = usePathname()
  const lastTrackedRef = useRef('')

  useEffect(() => {
    const trackCurrentPage = () => {
      const pagePath = normalizeTrackedPublicPath(pathname)
      if (!pagePath || !getConsent()) {
        if (!getConsent()) {
          try {
            window.localStorage.removeItem(SITE_ANALYTICS_VISITOR_KEY)
          } catch {
            // Analytics remains disabled when browser storage is unavailable.
          }
        }
        lastTrackedRef.current = ''
        return
      }

      const visitorId = getOrCreateVisitorId()
      if (!visitorId) return

      const navigationKey = `${visitorId}:${pagePath}`
      if (lastTrackedRef.current === navigationKey) return
      lastTrackedRef.current = navigationKey

      fetch('/info/api/analytics/visits', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId, pathname: pagePath }),
      }).catch((error) => {
        console.error('Site visit analytics request failed:', error)
      })
    }

    const handleConsentChange = () => {
      if (!getConsent()) {
        try {
          window.localStorage.removeItem(SITE_ANALYTICS_VISITOR_KEY)
        } catch {
          // Analytics remains disabled when browser storage is unavailable.
        }
        lastTrackedRef.current = ''
      }
      trackCurrentPage()
    }

    const handleStorageChange = (event) => {
      if (event.key === SITE_ANALYTICS_CONSENT_KEY) handleConsentChange()
    }

    trackCurrentPage()
    window.addEventListener('daet-analytics-consent', handleConsentChange)
    window.addEventListener('daet-cookie-consent', handleConsentChange)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('daet-analytics-consent', handleConsentChange)
      window.removeEventListener('daet-cookie-consent', handleConsentChange)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [pathname])

  return null
}
