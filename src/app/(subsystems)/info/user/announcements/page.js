'use client'

import { useCallback, useEffect, useState } from 'react'
import UserSectionHeader from '@/app/(subsystems)/info/components/user/UserSectionHeader'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Bell, Loader, MessageCircle, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'

export default function UserAnnouncementsPage() {
  const router = useRouter()
  const [authorizedUserId, setAuthorizedUserId] = useState('')
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [announcements, setAnnouncements] = useState([])
  const [sentiment, setSentiment] = useState(null)
  const [sentimentQuestion, setSentimentQuestion] = useState(null)
  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('info_announcements')
      .select('*')
      .eq('status', 'published')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('published_at', { ascending: false })

    if (error) throw error
    setAnnouncements(data || [])
    return true
  }, [])
  const realtime = useRealtimeRefresh({
    channelName: `user-announcements-${authorizedUserId || 'unknown'}`,
    tables: ['info_announcements'],
    enabled: Boolean(authorizedUserId),
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    setRefreshCallback(loadAnnouncements)
  }, [loadAnnouncements, setRefreshCallback])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const cookieSession = getAuthCookieFromDocument()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const activeSession = session || (cookieSession?.logged_in ? { user: { id: cookieSession.user_id } } : null)

        if (!activeSession?.user) {
          router.push('/info/login')
          return
        }

        setAuthChecking(false)
        setAuthorizedUserId(activeSession.user.id)

        const [, feedbackResponse] = await Promise.all([
          loadAnnouncements(),
          fetch('/info/api/daily-feedback', { credentials: 'same-origin' }),
        ])

        if (feedbackResponse.ok) {
          const feedback = await feedbackResponse.json()
          if (feedback.success && feedback.question) {
            setSentimentQuestion(feedback.question)
            setSentiment(feedback.sentiment || { positive: 0, neutral: 0, concern: 0, total: 0 })
          }
        }
      } catch (err) {
        console.error('Error loading announcements:', err)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [loadAnnouncements, router])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Recently'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getAnnouncementStyles = (announcement) => {
    const type = String(announcement.announcement_type || 'info').toLowerCase()
    const severity = String(announcement.severity || (
      type === 'urgent' ? 'critical' : type === 'important' ? 'warning' : 'info'
    )).toLowerCase()
    const styles = {
      critical: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800', icon: AlertCircle, iconColor: 'text-red-600', accent: 'border-l-red-500' },
      warning: { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-900', icon: Zap, iconColor: 'text-yellow-700', accent: 'border-l-yellow-500' },
      info: { bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800', icon: Bell, iconColor: 'text-blue-600', accent: 'border-l-blue-500' },
    }
    return styles[severity] || styles.info
  }

  const sentimentItems = [
    { key: 'positive', label: 'Enjoyed it', color: 'bg-emerald-500' },
    { key: 'neutral', label: 'It was okay', color: 'bg-sky-500' },
    { key: 'concern', label: 'Needs improvement', color: 'bg-amber-500' },
  ]

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
    <main className="tourism-shell usr-section-page usr-announcements min-h-screen text-slate-900">
      <div className="usr-section-container mx-auto max-w-[1000px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
        <UserSectionHeader eyebrow="Stay informed" title="Announcements" description="Official updates, helpful advisories, and the latest news from the Daet tourism office." emoji="📣" hideMobileTitle />
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-4" />

        {sentimentQuestion && sentiment && (
          <section className="mb-6 rounded-[20px] border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Visitor sentiments</p>
                <h2 className="mt-1 text-base font-black text-slate-900">{sentimentQuestion.question}</h2>
                <p className="mt-1 text-xs text-slate-500">{sentiment.total} response{sentiment.total === 1 ? '' : 's'} from today</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {sentimentItems.map((item) => {
                const count = sentiment[item.key] || 0
                const percentage = sentiment.total ? Math.round((count / sentiment.total) * 100) : 0
                return (
                  <div key={item.key}>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>{item.label}</span>
                      <span>{percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {loading ? (
          <div className="space-y-1.5">
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
          <div className="grid gap-4 md:grid-cols-2">
            {announcements.map((announcement) => {
              const styles = getAnnouncementStyles(announcement)
              const TypeIcon = styles.icon
              return (
                <Link key={announcement.id} href={`/info/user/announcements/${announcement.id}`} className={`usr-announcement-card block min-w-0 rounded-[24px] border border-l-4 p-5 transition hover:shadow-md sm:p-6 ${styles.bg} ${styles.accent}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white ${styles.iconColor}`}>
                        <TypeIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
                          {announcement.announcement_type || 'Info'}
                        </span>
                        <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}>
                          {announcement.severity || (announcement.announcement_type === 'urgent' ? 'Critical' : announcement.announcement_type === 'important' ? 'Warning' : 'Info')}
                        </span>
                        <h2 className="mt-1 break-words text-base font-bold text-slate-900">{announcement.title}</h2>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 sm:shrink-0">{formatDate(announcement.published_at || announcement.created_at)}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{announcement.content}</p>
                  {(announcement.image_url || announcement.video_url) && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {announcement.video_url ? (
                        <video src={announcement.video_url} controls className="h-48 w-full object-cover" preload="metadata" />
                      ) : (
                        <img src={announcement.image_url} alt={announcement.title} className="h-48 w-full object-cover" />
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}