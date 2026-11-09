'use client'

import { useEffect, useState } from 'react'

export function useUserSearchSuggestions(query, enabled = true) {
  const normalizedQuery = query.trim()
  const [result, setResult] = useState({ query: '', users: [], loading: false })

  useEffect(() => {
    if (!enabled || normalizedQuery.length < 2) return

    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(async () => {
      setResult({ query: normalizedQuery, users: [], loading: true })
      try {
        const response = await fetch(
          `/info/api/search/users?q=${encodeURIComponent(normalizedQuery)}&limit=5&includeSocial=false&suggestionsOnly=true`,
          { credentials: 'same-origin', cache: 'no-store', signal: controller.signal },
        )
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Unable to load people suggestions.')
        }
        if (active) setResult({ query: normalizedQuery, users: Array.isArray(data.users) ? data.users : [], loading: false })
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        console.error('People suggestions failed:', error)
        setResult({ query: normalizedQuery, users: [], loading: false })
      }
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [enabled, normalizedQuery])

  if (!enabled || normalizedQuery.length < 2) return { query: normalizedQuery, users: [], loading: false }
  return result.query === normalizedQuery ? result : { query: normalizedQuery, users: [], loading: true }
}
