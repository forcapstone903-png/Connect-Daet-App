'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  Lock,
  MessageSquare,
  Pin,
  Share2,
  Tag,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import VisitorBackButton from '@/app/(subsystems)/info/components/visitor/VisitorBackButton'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import RealtimeStatus from '@/app/(subsystems)/info/components/user/RealtimeStatus'
import { isImageAttachment, parsePostContent } from '@/lib/postContent'

function formatDate(value) {
  if (!value) return 'New'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'New'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'C'
}

function getStatusColor(status) {
  switch (status) {
    case 'locked':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'archived':
      return 'bg-slate-50 text-slate-700 border-slate-200'
    case 'published':
    case 'active':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

export default function PublicThreadDetailPage() {
  const params = useParams()
  const threadId = params?.id
  const [thread, setThread] = useState(null)
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const refreshThreadRef = useRef(null)
  const realtime = useRealtimeRefresh({
    channelName: `visitor-forum-thread-${threadId || 'unknown'}`,
    tables: [
      { table: 'forum_threads', filter: `id=eq.${threadId}` },
      { table: 'forum_replies', filter: `thread_id=eq.${threadId}` },
    ],
    enabled: Boolean(threadId),
  })
  const { setRefreshCallback } = realtime

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        if (!threadId) return false

        const { data: threadData, error: threadError } = await supabase
          .from('forum_threads')
          .select(
            `
            *,
            forum_categories(name),
            info_users!forum_threads_created_by_fkey(full_name)
          `
          )
          .eq('id', threadId)
          .in('status', ['published', 'closed'])
          .maybeSingle()

        if (threadError) {
          console.error('Error loading thread:', threadError.message || threadError)
          return false
        }
        if (!threadData) {
          if (!ignore) {
            setThread(null)
            setReplies([])
          }
          return true
        }
        if (!ignore) setThread(threadData)

        const { data: repliesData, error: repliesError } = await supabase
            .from('forum_replies')
            .select(
              `
              *,
              info_users(full_name)
            `
            )
            .eq('thread_id', threadId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
        if (repliesError) throw repliesError

        if (!ignore) setReplies(repliesData || [])

        return true
      } catch (error) {
        console.error('Thread fetch failed:', {
          message: error?.message || String(error),
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        })
        return false
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    refreshThreadRef.current = loadData
    void loadData()

    return () => {
      ignore = true
      refreshThreadRef.current = null
    }
  }, [threadId])

  useEffect(() => {
    setRefreshCallback(() => refreshThreadRef.current?.() ?? false)
  }, [setRefreshCallback])

  const handleShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = thread?.title || 'Check out this discussion'

    if (platform === 'copy') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
      alert('Link copied to clipboard!')
    } else {
      const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      }

      if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank')
      }
    }

    setShowShareMenu(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-16 animate-pulse rounded-[20px] bg-slate-200" />
          <div className="mb-6 h-64 animate-pulse rounded-[20px] bg-slate-200" />
        </div>
      </main>
    )
  }

  if (!thread) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Thread not found.</p>
          <div className="mt-3"><VisitorBackButton /></div>
        </div>
      </main>
    )
  }

  const parsedThreadContent = parsePostContent(thread.content)
  const threadAttachments = [...new Set([
    ...(Array.isArray(thread.image_urls) ? thread.image_urls : []),
    ...parsedThreadContent.attachments,
  ])]
  const threadAuthor = thread.info_users?.full_name || 'Community member'

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-4xl px-3 pt-3 sm:px-5 lg:px-6">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} className="mb-3" />
      </div>
      <div className="mx-auto max-w-4xl px-3 pb-12 pt-3 sm:px-5 lg:px-6">
        <div className="mb-5 flex items-center justify-between">
          <VisitorBackButton />

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
              title="Share"
              aria-label="Share this discussion"
              aria-expanded={showShareMenu}
            >
              <Share2 className="h-5 w-5" />
            </button>

            {showShareMenu && (
              <div className="absolute right-0 top-12 z-10 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <button type="button" onClick={() => handleShare('twitter')} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">Share on Twitter</button>
                <button type="button" onClick={() => handleShare('facebook')} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">Share on Facebook</button>
                <button type="button" onClick={() => handleShare('copy')} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">Copy link</button>
              </div>
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="uppercase tracking-[0.12em]">Community forum</span>
          {thread.forum_categories?.name && (
            <>
              <span aria-hidden="true">/</span>
              <span className="text-sky-700">{thread.forum_categories.name}</span>
            </>
          )}
        </div>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-gradient-to-br from-white via-white to-sky-50/70 px-5 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-wrap items-center gap-2">
              {thread.pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                  <Pin className="h-3.5 w-3.5" />
                  Pinned
                </span>
              )}
              {thread.forum_categories?.name && (
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-800">
                  {thread.forum_categories.name}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusColor(thread.status)}`}>
                {thread.status === 'published' || thread.status === 'active'
                  ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  : thread.status === 'locked' || thread.status === 'closed'
                    ? <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                {thread.status === 'closed' ? 'Locked' : thread.status === 'active' ? 'Published' : thread.status}
              </span>
            </div>

            <h1 className="mt-4 break-words text-2xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-3xl">
              {thread.title}
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-800 ring-2 ring-white">
                {getInitials(threadAuthor)}
              </span>
              <span className="font-semibold text-slate-800">{threadAuthor}</span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">•</span>
              <time className="inline-flex items-center gap-1.5" dateTime={thread.created_at}>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(thread.created_at)}
              </time>
            </div>

            {thread.tags && thread.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {thread.tags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700 sm:text-base">
              {parsedThreadContent.text}
            </div>
          {threadAttachments.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {threadAttachments.map((url, index) => (
                <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-slate-200">
                  {isImageAttachment(url)
                    ? <img src={url} alt={`Discussion attachment ${index + 1}`} className="h-36 w-full object-cover transition hover:scale-[1.02]" />
                    : <span className="block truncate px-3 py-4 text-sm font-semibold text-sky-700">Open attachment {index + 1}</span>}
                </a>
              ))}
            </div>
          )}
          </div>

          <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-sm text-slate-500 sm:px-8">
            <span className="inline-flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span><strong className="font-semibold text-slate-700">{thread.views || 0}</strong> views</span>
            </span>
            <a href="#forum-replies" className="inline-flex items-center gap-2 transition hover:text-sky-700">
              <MessageSquare className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span><strong className="font-semibold text-slate-700">{replies.length}</strong> {replies.length === 1 ? 'reply' : 'replies'}</span>
            </a>
          </footer>
        </article>

        <section id="forum-replies" className="mt-8 scroll-mt-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <MessageSquare className="h-5 w-5 text-sky-700" aria-hidden="true" />
                Replies
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">{replies.length}</span>
              </h2>
              <p className="mt-1 text-sm text-slate-500">Responses from the community</p>
            </div>
          </div>

          {replies.length > 0 ? (
            <div className="space-y-3">
              {replies.map((reply) => {
                const replyAuthor = reply.info_users?.full_name || 'Community member'

                return (
                  <article key={reply.id} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${reply.is_best_answer ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${reply.is_best_answer ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {getInitials(replyAuthor)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-bold text-slate-900">{replyAuthor}</span>
                          {reply.is_best_answer && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                              Best answer
                            </span>
                          )}
                        </div>
                        <time className="mt-0.5 block text-xs text-slate-500" dateTime={reply.created_at}>
                          {formatDate(reply.created_at)}
                        </time>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{reply.content}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1.5">
                            <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                            {reply.likes || 0} likes
                          </span>
                          {(reply.upvotes != null || reply.downvotes != null) && (
                            <span>{reply.upvotes ?? reply.likes ?? 0} helpful · {reply.downvotes ?? 0} not helpful</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center shadow-sm">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <MessageSquare className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-sm font-bold text-slate-800">No replies yet</h3>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
                There are no responses in this discussion yet. Any community replies will appear here.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}