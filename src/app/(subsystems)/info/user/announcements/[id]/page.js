'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Bookmark, Loader, MessageCircle, ShieldAlert, X, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import Reactions from '@/app/(subsystems)/info/components/user/Reactions'
import ShareRepost from '@/app/(subsystems)/info/components/user/ShareRepost'
import Comments from '@/app/(subsystems)/info/components/user/Comments'

function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Recently'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AnnouncementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const announcementId = params.id
  const [authorizedUserId, setAuthorizedUserId] = useState('')
  const [authChecking, setAuthChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [announcement, setAnnouncement] = useState(null)
  const [error, setError] = useState(null)
  const [commentCount, setCommentCount] = useState(0)
  const [isSaved, setIsSaved] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)

  const loadAnnouncement = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('info_announcements')
      .select('*')
      .eq('id', announcementId)
      .eq('status', 'published')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle()

    if (queryError) throw queryError
    setAnnouncement(data || null)
    setError(data ? null : 'Post not found.')
    return true
  }, [announcementId])

  const realtime = useRealtimeRefresh({
    channelName: `announcement-detail-${authorizedUserId || 'unknown'}-${announcementId}`,
    tables: [{ table: 'info_announcements', filter: `id=eq.${announcementId}` }],
    enabled: Boolean(authorizedUserId && announcementId),
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    setRefreshCallback(loadAnnouncement)
  }, [loadAnnouncement, setRefreshCallback])

  useEffect(() => {
    let active = true
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

        setAuthorizedUserId(activeSession.user.id)
        await loadAnnouncement()
      } catch (loadError) {
        console.error('Error loading announcement:', loadError)
        if (active) setError('Unable to load this announcement right now.')
      } finally {
        if (active) {
          setAuthChecking(false)
          setLoading(false)
        }
      }
    }

    void checkAuth()
    return () => { active = false }
  }, [loadAnnouncement, router])

  useEffect(() => {
    if (!announcementId) return
    let active = true
    const loadCommentCount = async () => {
      const { count, error: countError } = await supabase
        .from('content_comments')
        .select('id', { count: 'exact', head: true })
        .eq('content_type', 'announcement')
        .eq('content_id', announcementId)
      if (countError) {
        console.error('Announcement comment count load failed:', countError)
        return
      }
      if (active) setCommentCount(count || 0)
    }
    void loadCommentCount()
    return () => { active = false }
  }, [announcementId])

  useEffect(() => {
    if (!authorizedUserId || !announcementId) return
    let active = true
    const loadSavedState = async () => {
      const { data, error: saveError } = await supabase
        .from('user_favorites')
        .select('id')
        .eq('user_id', authorizedUserId)
        .eq('item_type', 'announcement')
        .eq('item_id', announcementId)
        .maybeSingle()
      if (saveError) {
        console.error('Announcement saved state load failed:', saveError)
        return
      }
      if (active) setIsSaved(Boolean(data))
    }
    void loadSavedState()
    return () => { active = false }
  }, [announcementId, authorizedUserId])

  const handleSave = async () => {
    if (!authorizedUserId || !announcement) return
    try {
      if (isSaved) {
        const { error: saveError } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', authorizedUserId)
          .eq('item_type', 'announcement')
          .eq('item_id', announcementId)
        if (saveError) throw saveError
      } else {
        const { error: saveError } = await supabase
          .from('user_favorites')
          .upsert(
            { user_id: authorizedUserId, item_type: 'announcement', item_id: announcementId },
            { onConflict: 'user_id,item_type,item_id' }
          )
        if (saveError) throw saveError
      }
      setIsSaved((saved) => !saved)
    } catch (saveError) {
      console.error('Announcement save update failed:', saveError)
      window.alert(saveError.message || 'Unable to update saved items right now.')
    }
  }

  if (authChecking || loading) {
    return (
      <main className="announcement-detail-view flex min-h-[100dvh] items-center justify-center lg:min-h-[calc(100dvh-64px)]">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Loader className="h-5 w-5 animate-spin" />
          Loading announcement...
        </div>
      </main>
    )
  }

  if (error || !announcement) {
    return (
      <main className="announcement-detail-view flex min-h-[100dvh] items-center justify-center p-6 lg:min-h-[calc(100dvh-64px)]">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-sky-300" />
          <p className="text-sm text-slate-200">{error || 'Announcement not found'}</p>
          <Link href="/info/user/announcements" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-300 hover:text-white">
            <ArrowLeft className="h-4 w-4" />Back to Announcements
          </Link>
        </div>
      </main>
    )
  }

  const type = String(announcement.announcement_type || 'info').toLowerCase()
  const severity = String(announcement.severity || (
    type === 'urgent' ? 'critical' : type === 'important' ? 'warning' : 'info'
  )).toLowerCase()
  const severityStyles = severity === 'critical'
    ? { badge: 'border-red-400 bg-red-500/15 text-red-200', hero: 'from-red-700 to-red-950' }
    : severity === 'warning'
      ? { badge: 'border-yellow-400 bg-yellow-500/15 text-yellow-100', hero: 'from-yellow-600 to-amber-900' }
      : { badge: 'border-blue-400 bg-blue-500/15 text-blue-200', hero: 'from-blue-700 to-slate-950' }
  const isWeather = type === 'weather'
  const signalNumber = announcement.title?.match(/(?:signal|no\.?)\s*(\d+)/i)?.[1]
  const originalPost = {
    ...announcement,
    title: announcement.title,
    content: announcement.content,
    author: { id: announcement.created_by, full_name: 'Daet Tourism Office' },
  }

  return (
    <main className="announcement-detail-view min-h-[100dvh] lg:min-h-[calc(100dvh-64px)]">
      <div className="announcement-detail-frame mx-auto flex min-h-[100dvh] w-full max-w-[860px] flex-col overflow-hidden border-x border-slate-700/80 lg:min-h-[calc(100dvh-64px)]">
        <header className="announcement-detail-header flex h-10 shrink-0 items-center gap-3 border-b border-slate-700/80 px-4">
          <Link
            href="/info/user/announcements"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-200 transition hover:bg-slate-800"
            aria-label="Back to announcements"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xs font-bold text-white">Announcements</h1>
        </header>

        {announcement.video_url ? (
          <video
            src={announcement.video_url}
            controls
            preload="metadata"
            className="announcement-detail-hero h-[min(48vw,220px)] min-h-[150px] w-full bg-slate-950 object-cover"
          />
        ) : announcement.image_url ? (
          <img
            src={announcement.image_url}
            alt={announcement.title}
            className="announcement-detail-hero h-[min(48vw,220px)] min-h-[150px] w-full object-cover"
          />
        ) : (
          <div className={`announcement-detail-hero flex h-[150px] w-full flex-col items-center justify-center bg-gradient-to-br text-center ${severityStyles.hero} ${isWeather ? 'announcement-weather-hero' : ''}`}>
            {isWeather && signalNumber ? (
              <>
                <span className="text-7xl font-black leading-none text-white">{signalNumber}</span>
                <span className="mt-1 text-xs font-bold text-slate-950">Weather Signal, No. {signalNumber}</span>
              </>
            ) : (
              <>
                <Zap className="h-10 w-10 text-white/90" />
                <span className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-white/90">{type} announcement</span>
              </>
            )}
          </div>
        )}

        <article className="min-h-0 flex-1 px-4 pb-8 pt-4 sm:px-6 sm:pt-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`announcement-type-badge announcement-type-${type} border ${severityStyles.badge}`}>
              <span aria-hidden="true">ⓘ</span>{type}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${severityStyles.badge}`}>
              {severity}
            </span>
            <time className="text-[11px] font-medium text-slate-400">
              {formatDate(announcement.published_at || announcement.created_at)}
            </time>
          </div>
          <h2 className="mt-3 text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl">
            {announcement.title}
          </h2>
          <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.65] text-slate-200 sm:text-sm">
            {announcement.content}
          </p>
          {announcement.expires_at && (
            <p className="mt-5 text-xs text-slate-400">Expires {formatDate(announcement.expires_at)}</p>
          )}
        </article>

        <div className="announcement-detail-actions sticky bottom-0 z-20 grid grid-cols-4 items-center border-t border-slate-700/80 px-3 py-2.5">
          <Reactions
            contentType="announcement"
            contentId={announcement.id}
            userId={authorizedUserId}
            compact
            heartOnly
            compactFeed
            contentTitle={announcement.title}
          />
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="announcement-detail-action"
            aria-label={`Comments, ${commentCount}`}
          >
            <MessageCircle className="h-4 w-4" />
            <span>{commentCount}</span>
          </button>
          <ShareRepost
            contentType="announcement"
            contentId={announcement.id}
            userId={authorizedUserId}
            originalPost={originalPost}
            compactFeed
            buttonClassName="announcement-detail-share"
          />
          <button
            type="button"
            onClick={handleSave}
            className={`announcement-detail-action ${isSaved ? 'is-saved' : ''}`}
            aria-label={isSaved ? 'Remove from saved items' : 'Save announcement'}
            aria-pressed={isSaved}
          >
            <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {commentsOpen && (
        <div className="announcement-comments-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCommentsOpen(false)
        }}>
          <section className="announcement-comments-sheet" role="dialog" aria-modal="true" aria-label="Announcement comments">
            <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-4 py-3">
              <h2 className="text-sm font-bold text-white">Comments</h2>
              <button type="button" onClick={() => setCommentsOpen(false)} aria-label="Close comments" className="rounded-full p-2 text-slate-300 hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-hidden p-3">
              <Comments
                contentType="announcement"
                contentId={announcement.id}
                userId={authorizedUserId}
                contentOwnerId={announcement.created_by}
                contentTitle={announcement.title}
                sheetMode
                onClose={() => setCommentsOpen(false)}
                onCommentCountChange={setCommentCount}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
