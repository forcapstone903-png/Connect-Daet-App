'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LoaderCircle } from 'lucide-react'
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
      <main className="event-detail-page -mt-16 min-h-screen lg:mt-0">
        <div className="event-detail-loading" role="status" aria-live="polite">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>Verifying your session…</span>
        </div>
      </main>
    )
  }

  return (
    <div className="-mt-16 lg:mt-0">
      <EventDetailsView key={String(eventId)} eventId={eventId} userId={userId} backHref="/info/user/events" />
    </div>
  )
}
