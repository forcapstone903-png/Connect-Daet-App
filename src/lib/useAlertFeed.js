'use client'

// Public alert feed with live updates.
// Data: GET /info/api/alerts (public, CDN-cached 15 s). Realtime changes on
// public.alerts trigger a refetch; the query uses a 5-second bucket so a burst
// of clients share one cache entry while still seeing new alerts within ~5 s.
// The hook also reconciles every 30 s (useRealtimeRefresh) in case the
// realtime connection is unavailable.

import { startTransition, useCallback, useEffect, useState } from 'react'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const EMPTY = { current: [], past: [], categories: [] }

export function useAlertFeed({ channelName, enabled = true, limit = 50 } = {}) {
  const [feed, setFeed] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchFeed = useCallback(async () => {
    try {
      const bucket = Math.floor(Date.now() / 5000)
      const response = await fetch(`/info/api/alerts?limit=${limit}&v=${bucket}`, { credentials: 'omit' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Alerts are temporarily unavailable.')
      setFeed({ current: result.current || [], past: result.past || [], categories: result.categories || [] })
      setError('')
      return true
    } catch (fetchError) {
      setError(fetchError.message)
      return false
    } finally {
      setLoading(false)
    }
  }, [limit])

  const realtime = useRealtimeRefresh({ channelName, tables: ['alerts'], enabled })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    setRefreshCallback(fetchFeed)
  }, [fetchFeed, setRefreshCallback])

  useEffect(() => {
    if (!enabled) return
    startTransition(() => {
      void fetchFeed()
    })
  }, [enabled, fetchFeed])

  return { ...feed, loading, error, refresh: fetchFeed, connectionStatus: realtime.connectionStatus }
}
