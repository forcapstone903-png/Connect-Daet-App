'use client'

import { useEffect, useState } from 'react'
import { formatPostDate, formatPostTimestamp, getPostTimestampRefreshDelay } from '@/lib/postTimestamp.mjs'

export default function PostTimestamp({ value, className }) {
  const [now, setNow] = useState(null)
  const timestamp = value ? new Date(value) : null
  const validTimestamp = timestamp && !Number.isNaN(timestamp.getTime())

  useEffect(() => {
    if (!validTimestamp) return undefined

    let timer
    const refresh = () => {
      const currentTime = Date.now()
      setNow(currentTime)
      const delay = getPostTimestampRefreshDelay(value, currentTime)
      if (delay !== null) timer = window.setTimeout(refresh, delay)
    }

    refresh()
    return () => window.clearTimeout(timer)
  }, [value, validTimestamp])

  const label = now === null
    ? formatPostDate(value)
    : formatPostTimestamp(value, now)

  return (
    <time
      className={className}
      dateTime={validTimestamp ? timestamp.toISOString() : undefined}
      title={validTimestamp ? timestamp.toLocaleString() : undefined}
    >
      {label}
    </time>
  )
}
