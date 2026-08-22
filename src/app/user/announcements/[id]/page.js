'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, Bell, Loader, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function AnnouncementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const announcementId = params.id
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [announcement, setAnnouncement] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user) {
          router.push('/login')
          return
        }

        setAuthChecking(false)

        const { data, error } = await supabase
          .from('info_announcements')
          .select('*')
          .eq('id', announcementId)
          .eq('status', 'published')
          .single()

        if (error) throw error
        setAnnouncement(data)
      } catch (err) {
        console.error('Error loading announcement:', err)
        setError('Announcement not found or unavailable')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, announcementId])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Recently'
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const getTypeStyles = (type) => {
    const styles = {
      urgent: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', icon: AlertCircle, iconColor: 'text-red-500' },
      important: { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', icon: Zap, iconColor: 'text-yellow-500' },
      info: { bg: 'bg-sky-50 border-sky-200', badge: 'bg-sky-100 text-sky-700', icon: Bell, iconColor: 'text-sky-500' },
      event: { bg: 'bg-purple-50 border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: Bell, iconColor: 'text-purple-500' },
      weather: { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: AlertCircle, iconColor: 'text-orange-500' },
    }
    return styles[type] || styles.info
  }

  if (authChecking || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (error || !announcement) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9] p-6">
        <div className="w-full max-w-md rounded-[24px] border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-red-600">{error || 'Announcement not found'}</p>
          <Link href="/user/announcements" className="mt-4 inline-block rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
            Back to Announcements
          </Link>
        </div>
      </main>
    )
  }

  const styles = getTypeStyles(announcement.announcement_type)
  const TypeIcon = styles.icon

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[700px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <Link href="/user/announcements" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Announcements
        </Link>

        <div className={`overflow-hidden rounded-[24px] border ${styles.bg} shadow-sm`}>
          <div className="p-5 md:p-8">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white ${styles.iconColor}`}>
                <TypeIcon className="h-6 w-6" />
              </div>
              <div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
                  {announcement.announcement_type || 'Info'}
                </span>
                <h1 className="mt-1 text-xl font-black text-slate-900 md:text-2xl">{announcement.title}</h1>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
              <span>{formatDate(announcement.published_at || announcement.created_at)}</span>
              {announcement.expires_at && (
                <>
                  <span>•</span>
                  <span>Expires: {formatDate(announcement.expires_at)}</span>
                </>
              )}
            </div>

            {announcement.image_url && (
              <img src={announcement.image_url} alt={announcement.title} className="mt-5 h-56 w-full rounded-2xl object-cover" />
            )}

            <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-700 md:text-base">{announcement.content}</p>
          </div>
        </div>
      </div>
    </main>
  )
}