// Admin hub metrics: small aggregate counts rendered by the console hub pages.
//
// Cache decision record (repository standard: docs/caching.md)
// Feature:              admin hub metric tiles
// Data fetched:         row counts from Supabase (info_users, info_feedback,
//                       info_inquiries, info_announcements, content tables)
// Change frequency:     changes only when an admin writes content
// Visibility:           sensitive — admin-only aggregates, no personal fields
// Freshness:            minutes
// Stale behavior:       keep the last snapshot on screen while revalidating
// Missing-cache:        skeleton tiles (never show a misleading zero)
// Invalidation trigger: TTL expiry or the page's Refresh action
// Cache layer:          in-memory only (src/lib/cache.js), never persistent
// Cache key:            admin:metrics:{hub}
// TTL:                  60 seconds
// Offline behavior:     snapshot stays visible with an error hint
// Security notes:       aggregate counts only; nothing stored outside memory
// Manual clear method:  clearAdminMetricsCache(hub) / a browser reload
'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCache, invalidateCache, setCache } from '@/lib/cache'
import { supabase } from '@/lib/supabase'

export const ADMIN_METRICS_TTL_MS = 60 * 1000

export function adminMetricsCacheKey(hub) {
  return `admin:metrics:${hub}`
}

export function clearAdminMetricsCache(hub) {
  if (!hub) return
  invalidateCache(adminMetricsCacheKey(hub))
}

// Exact row count for a table, optionally filtered by one column.
export async function countRows(table, filter) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter?.column) query = query.eq(filter.column, filter.value)

  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

// Resolves a list of [key, () => Promise<value>] pairs into an object. A failed
// lookup resolves to null so one unavailable table cannot blank the whole row.
export async function resolveMetricEntries(entries) {
  const results = await Promise.all(
    entries.map(async ([key, load]) => {
      try {
        return [key, await load()]
      } catch (error) {
        console.error(`Failed to load admin metric "${key}":`, error)
        return [key, null]
      }
    })
  )

  return Object.fromEntries(results)
}

export default function useAdminMetrics(hub, load) {
  // Seed from the cache during the first render so a fresh snapshot paints
  // immediately and the effect only has to handle the network path.
  const [metrics, setMetrics] = useState(() => {
    const cached = getCache(adminMetricsCacheKey(hub))
    return cached ? cached.data : null
  })
  const [loading, setLoading] = useState(() => !getCache(adminMetricsCacheKey(hub)))
  const [error, setError] = useState('')

  const fetchMetrics = useCallback(async () => {
    const cacheKey = adminMetricsCacheKey(hub)
    const next = await load()
    if (next) setCache(cacheKey, next, ADMIN_METRICS_TTL_MS)
    return next
  }, [hub, load])

  useEffect(() => {
    let cancelled = false

    const hydrate = async () => {
      try {
        const next = await fetchMetrics()
        if (cancelled) return
        if (next) setMetrics(next)
        setError('')
      } catch (loadError) {
        if (cancelled) return
        console.error('Failed to load admin metrics:', loadError)
        setError('Live metrics are unavailable right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    hydrate()

    return () => {
      cancelled = true
    }
  }, [fetchMetrics])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    clearAdminMetricsCache(hub)

    try {
      const next = await fetchMetrics()
      if (next) setMetrics(next)
    } catch (loadError) {
      console.error('Failed to refresh admin metrics:', loadError)
      setError('Live metrics are unavailable right now.')
    } finally {
      setLoading(false)
    }
  }, [fetchMetrics, hub])

  return { metrics, loading, error, refresh }
}