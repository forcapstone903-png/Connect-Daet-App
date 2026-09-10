'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const ADMIN_SCROLL_KEY_PREFIX = 'admin-scroll-position:'

export default function AdminLayout({ children }) {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    window.history.scrollRestoration = 'manual'

    const query = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : window.location.search

    const routeKey = `${pathname}${query ? `?${query}` : ''}`
    const storageKey = `${ADMIN_SCROLL_KEY_PREFIX}${routeKey}`
    const savedY = Number(sessionStorage.getItem(storageKey) || '0')

    const savePosition = () => {
      try {
        sessionStorage.setItem(storageKey, String(Math.round(window.scrollY)))
      } catch {
        // Storage is optional in restricted browser contexts.
      }
    }

    const restorePosition = () => {
      if (savedY > 0) {
        window.scrollTo({ top: savedY, behavior: 'auto' })
      }
    }

    window.addEventListener('scroll', savePosition, { passive: true })
    const frame = requestAnimationFrame(restorePosition)

    return () => {
      savePosition()
      window.removeEventListener('scroll', savePosition)
      cancelAnimationFrame(frame)
    }
  }, [pathname])

  return <div className="admin-page-shell">{children}</div>
}
