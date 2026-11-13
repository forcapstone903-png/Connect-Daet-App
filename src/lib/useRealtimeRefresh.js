'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const REALTIME_RECONCILIATION_INTERVAL = 30_000

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]

export function useRealtimeRefresh({ channelName, tables, enabled = true, shouldRefreshEvent }) {
  const refreshCallbackRef = useRef(null)
  const shouldRefreshEventRef = useRef(shouldRefreshEvent)
  const inFlightRefreshRef = useRef(null)
  const refreshGenerationRef = useRef(0)
  const isConnectedRef = useRef(false)
  const refreshFailedRef = useRef(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState(null)
  const tableConfig = JSON.stringify(tables)

  const setRefreshCallback = useCallback((callback) => {
    refreshCallbackRef.current = callback
  }, [])

  useEffect(() => {
    shouldRefreshEventRef.current = shouldRefreshEvent
  }, [shouldRefreshEvent])

  const refresh = useCallback(async () => {
    if (!navigator.onLine || document.visibilityState !== 'visible') return false
    const generation = refreshGenerationRef.current
    const existingRefresh = inFlightRefreshRef.current
    if (existingRefresh?.generation === generation) return existingRefresh.promise

    const callback = refreshCallbackRef.current
    if (!callback) return false

    const refreshEntry = { generation, promise: null }
    const refreshPromise = (async () => {
      try {
        const succeeded = await callback()
        if (generation !== refreshGenerationRef.current) return false
        if (succeeded === false) {
          refreshFailedRef.current = true
          setConnectionStatus(!navigator.onLine ? 'offline' : isConnectedRef.current ? 'stale' : 'reconnecting')
          return false
        }
        setLastSuccessfulRefresh(new Date())
        refreshFailedRef.current = false
        setConnectionStatus(isConnectedRef.current ? 'live' : navigator.onLine ? 'reconnecting' : 'offline')
        return true
      } catch (error) {
        if (generation !== refreshGenerationRef.current) return false
        console.error(`Realtime refresh failed for ${channelName}:`, error)
        refreshFailedRef.current = true
        setConnectionStatus(!navigator.onLine ? 'offline' : isConnectedRef.current ? 'stale' : 'reconnecting')
        return false
      } finally {
        if (inFlightRefreshRef.current === refreshEntry) inFlightRefreshRef.current = null
      }
    })()
    refreshEntry.promise = refreshPromise
    inFlightRefreshRef.current = refreshEntry
    return refreshPromise
  }, [channelName])

  useEffect(() => {
    if (!enabled || !supabase?.channel) {
      return undefined
    }

    let active = true
    refreshGenerationRef.current += 1
    let channel = null
    let reconnectTimer = null
    let refreshTimer = null
    let notificationTimer = null
    let reconnectAttempt = 0

    const refreshStatus = () => {
      if (!active) return
      if (!navigator.onLine) {
        setConnectionStatus('offline')
      } else if (!isConnectedRef.current || refreshFailedRef.current) {
        setConnectionStatus(isConnectedRef.current ? 'stale' : 'reconnecting')
      } else {
        setConnectionStatus('live')
      }
    }

    const queueRefresh = () => {
      if (!active || document.visibilityState !== 'visible') return
      window.clearTimeout(notificationTimer)
      notificationTimer = window.setTimeout(() => {
        void refresh()
      }, 150)
    }

    const scheduleReconnect = () => {
      if (!active || reconnectTimer || !navigator.onLine) return
      isConnectedRef.current = false
      refreshStatus()
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(async () => {
        reconnectTimer = null
        if (channel) {
          const previousChannel = channel
          channel = null
          try {
            await supabase.removeChannel(previousChannel)
          } catch (error) {
            console.error(`Realtime channel cleanup failed for ${channelName}:`, error)
          }
        }
        connect()
      }, delay)
    }

    const connect = () => {
      if (!active || !navigator.onLine) {
        refreshStatus()
        return
      }

      setConnectionStatus('connecting')
      channel = supabase.channel(channelName)
      for (const tableConfigEntry of JSON.parse(tableConfig)) {
        const table = typeof tableConfigEntry === 'string' ? tableConfigEntry : tableConfigEntry.table
        channel.on('postgres_changes', {
          event: '*',
          schema: 'public',
          table,
          ...(typeof tableConfigEntry === 'object' && tableConfigEntry.filter
            ? { filter: tableConfigEntry.filter }
            : {}),
        }, (payload) => {
          if (shouldRefreshEventRef.current && !shouldRefreshEventRef.current(payload)) return
          queueRefresh()
        })
      }

      channel.subscribe((status) => {
        if (!active) return
        if (status === 'SUBSCRIBED') {
          isConnectedRef.current = true
          reconnectAttempt = 0
          window.clearTimeout(reconnectTimer)
          reconnectTimer = null
          refreshStatus()
          queueRefresh()
          return
        }

        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          scheduleReconnect()
        }
      })
    }

    const handleOnline = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      reconnectAttempt = 0
      if (channel) {
        const previousChannel = channel
        channel = null
        void supabase.removeChannel(previousChannel)
          .catch((error) => console.error(`Realtime channel cleanup failed for ${channelName}:`, error))
          .then(connect)
      } else {
        connect()
      }
      queueRefresh()
    }

    const handleOffline = () => {
      isConnectedRef.current = false
      setConnectionStatus('offline')
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') queueRefresh()
    }

    connect()
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REALTIME_RECONCILIATION_INTERVAL)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      refreshGenerationRef.current += 1
      window.clearInterval(refreshTimer)
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(notificationTimer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      isConnectedRef.current = false
      if (channel) {
        void supabase.removeChannel(channel)
          .catch((error) => console.error(`Realtime channel cleanup failed for ${channelName}:`, error))
      }
    }
  }, [channelName, enabled, refresh, tableConfig])

  return {
    connectionStatus: enabled ? connectionStatus : 'offline',
    lastSuccessfulRefresh,
    setRefreshCallback,
  }
}
