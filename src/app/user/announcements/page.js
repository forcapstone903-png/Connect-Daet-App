'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Bell, Loader, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

export default function UserAnnouncementsPage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [announcements, setAnnouncements] = useState([])

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
          .eq('status', 'published')
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('published_at', { ascending: false })

        if (error) throw error
        setAnnouncements(data || [])
      } catch (err) {
        console.error('Error loading announcements:', err)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Recently'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f5f9]">
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader className="mx-auto mb-4 animate-spin text-slate-600" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-[800px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <Link href="/user/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition hover:text-sky-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-600">Updates</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">Announcements</h1>
          <p className="mt-1 text-sm text-slate-600">Important updates and advisories from the Daet tourism office</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[20px] border border-slate-200 bg-slate-100 p-5">
                <div className="h-5 w-1/3 rounded bg-slate-200" />
                <div className="mt-3 h-3 w-full rounded bg-slate-200" />
                <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <Bell className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">No announcements at this time</p>
            <p className="mt-1 text-xs text-slate-400">Check back later for updates</p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => {
              const styles = getTypeStyles(announcement.announcement_type)
              const TypeIcon = styles.icon
              return (
                <div key={announcement.id} className={`rounded-[20px] border p-5 ${styles.bg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white ${styles.iconColor}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
                          {announcement.announcement_type || 'Info'}
                        </span>
                        <h2 className="mt-1 text-base font-bold text-slate-900">{announcement.title}</h2>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatDate(announcement.published_at || announcement.created_at)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{announcement.content}</p>
                  {announcement.image_url && (
                    <img src={announcement.image_url} alt={announcement.title} className="mt-4 h-48 w-full rounded-xl object-cover" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}