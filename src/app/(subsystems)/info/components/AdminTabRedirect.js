'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminTabRedirect({ routes }) {
  const router = useRouter()

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    const destination = tab ? routes[tab] : null
    if (destination) router.replace(destination)
  }, [router, routes])

  return null
}
