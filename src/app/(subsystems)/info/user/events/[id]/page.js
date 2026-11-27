'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import EventDetailsView from '@/app/(subsystems)/info/components/user/EventDetailsView'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function EventDetailPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id
  const [userId, setUserId] = useState('')
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    let active = true
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const { data: { session } } = await supabase.auth.getSession()
        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user?.id) {
          router.push('/info/login')
          return
        }

        if (active) {
          setUserId(activeSession.user.id)
          setAuthChecking(false)
        }
      } catch (error) {
        console.error('Event detail authentication failed:', error)
        router.push('/info/login')
      }
    }

    void checkAuth()
    return () => { active = false }
  }, [router])

  if (authChecking) {
    return (
      <main
        className="event-detail-page event-details-light-page min-h-dvh"
        role="status"
        aria-label="Loading event details"
        aria-live="polite"
      >
        <div className="event-detail-content mx-auto pt-16" aria-hidden="true">
          <div className="h-6 w-32 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-4 h-[clamp(230px,70vw,420px)] animate-pulse rounded-2xl bg-slate-200" />
          <div className="mt-6 space-y-3">
            <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200" />
            <div className="h-9 w-3/4 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-4 w-40 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <div>
      <EventDetailsView key={String(eventId)} eventId={eventId} userId={userId} backHref="/info/user/events" />
    </div>
  )
}
