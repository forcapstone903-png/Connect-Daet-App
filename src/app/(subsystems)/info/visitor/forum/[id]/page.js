'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  Clock,
  Eye,
  Flag,
  Heart,
  Lock,
  MessageSquare,
  Pin,
  Share2,
  Tag,
  User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  const router = useRouter()
  const params = useParams()
  const threadId = params?.id
  const [thread, setThread] = useState(null)
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('Guest')
  const [userId, setUserId] = useState(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)
  const [userLikes, setUserLikes] = useState(new Set())
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
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
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Guest'
          setUserName(fullName.split(' ')[0] || fullName)
          setUserId(session.user.id)
        }

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
          .eq('status', 'published')
          .maybeSingle()

        if (threadError) {
          console.error('Error loading thread:', threadError)
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
            .order('is_best_answer', { ascending: false })
            .order('likes', { ascending: false })
            .order('created_at', { ascending: true })
        if (repliesError) throw repliesError

        if (!ignore) setReplies(repliesData || [])

        if (session?.user?.id) {
          const { data: subData, error: subscriptionError } = await supabase
            .from('forum_subscriptions')
            .select('id')
            .eq('thread_id', threadId)
            .eq('user_id', session.user.id)
            .maybeSingle()
          if (subscriptionError) throw subscriptionError

          if (!ignore) setIsSubscribed(!!subData)
        }

        return true
      } catch (error) {
        console.error('Thread fetch failed:', error)
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

  const handleSubscribe = async () => {
    if (!userId) {
      setShowAuthModal(true)
      return
    }

    try {
      if (isSubscribed) {
        await supabase
          .from('forum_subscriptions')
          .delete()
          .eq('thread_id', threadId)
          .eq('user_id', userId)
      } else {
        await supabase.from('forum_subscriptions').insert({
          thread_id: threadId,
          user_id: userId,
        })
      }

      setIsSubscribed(!isSubscribed)
    } catch (error) {
      console.error('Error toggling subscription:', error)
    }
  }

  const handleReplySubmit = async () => {
    if (!replyContent.trim()) return

    setSubmittingReply(true)
    try {
      if (!userId) {
        setShowAuthModal(true)
        return
      }

      const { error } = await supabase.from('forum_replies').insert({
        thread_id: threadId,
        user_id: userId,
        content: replyContent.trim(),
        status: 'active',
      })

      if (error) {
        console.error('Error posting reply:', error)
        alert('Failed to post reply')
      } else {
        setReplyContent('')
        const { data: newReplies } = await supabase
          .from('forum_replies')
          .select(
            `
            *,
            info_users(full_name)
          `
          )
          .eq('thread_id', threadId)
          .order('is_best_answer', { ascending: false })
          .order('likes', { ascending: false })
          .order('created_at', { ascending: true })

        setReplies(newReplies || [])
      }
    } catch (error) {
      console.error('Error submitting reply:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setSubmittingReply(false)
    }
  }

  const toggleLike = async (replyId) => {
    if (!userId) {
      setShowAuthModal(true)
      return
    }

    const newLikes = new Set(userLikes)

    if (newLikes.has(replyId)) {
      newLikes.delete(replyId)
    } else {
      newLikes.add(replyId)
    }

    setUserLikes(newLikes)
  }

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
          <Link href="/info/visitor" className="mt-3 text-xs font-semibold text-sky-600 hover:underline">
            Back to Home
          </Link>
        </div>
      </main>
    )
  }

  const parsedThreadContent = parsePostContent(thread.content)
  const threadAttachments = [...new Set([
    ...(Array.isArray(thread.image_urls) ? thread.image_urls : []),
    ...parsedThreadContent.attachments,
  ])]

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-4 lg:px-6">
        <RealtimeStatus status={realtime.connectionStatus} lastSuccessfulRefresh={realtime.lastSuccessfulRefresh} />
      </div>
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><MessageSquare className="h-6 w-6" /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Join the travel conversation</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">The full discussion is public. Create a free account to reply and follow helpful local advice.</p>
            <div className="mt-5 grid gap-2"><Link href="/info/register" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Create free account</Link><Link href="/info/login" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Sign in</Link></div>
            <button type="button" onClick={() => setShowAuthModal(false)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800">Continue browsing</button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 lg:px-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/info/visitor/forum"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubscribe}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 transition ${
                isSubscribed
                  ? 'border-sky-200 bg-sky-50 text-sky-600'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
            >
              <Bell className={`h-5 w-5 ${isSubscribed ? 'fill-current' : ''}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                title="Share"
              >
                <Share2 className="h-5 w-5" />
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-12 z-10 rounded-[16px] border border-slate-200 bg-white shadow-lg">
                  <button type="button" onClick={() => handleShare('twitter')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-[14px]">Share on Twitter</button>
                  <button type="button" onClick={() => handleShare('facebook')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on Facebook</button>
                  <button type="button" onClick={() => handleShare('copy')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-[14px]">Copy Link</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Thread */}
        <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {thread.pinned && <Pin className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                <h1 className="text-2xl font-bold text-slate-900 break-words">{thread.title}</h1>
              </div>

              <div className="mt-2 text-sm text-slate-600">
                {thread.forum_categories && (
                  <span className="inline-block rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                    {thread.forum_categories.name}
                  </span>
                )}
              </div>

              {thread.tags && thread.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {thread.tags.map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold flex-shrink-0 ${getStatusColor(thread.status)}`}>
              {thread.status === 'published' || thread.status === 'active' ? '✓' : thread.status === 'locked' ? '🔒' : '📦'} {thread.status === 'active' ? 'published' : thread.status}
            </div>
          </div>

          <div className="mt-6 whitespace-pre-wrap break-words text-base leading-relaxed text-slate-700">{parsedThreadContent.text}</div>
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

          {/* Thread Meta */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {thread.info_users?.full_name || 'Community member'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(thread.created_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {thread.views || 0} views
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {replies.length} replies
              </span>
            </div>
          </div>
        </div>

        {/* Reply Form */}
        {thread.status !== 'locked' && thread.status !== 'archived' && (
          userId ? <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">Share Your Reply</h3>

            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Share your thoughts..."
              rows={4}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleReplySubmit}
                disabled={submittingReply || !replyContent.trim()}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {submittingReply ? 'Posting...' : 'Post Reply'}
              </button>
            </div>
          </div> : (
            <div className="mb-6 flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Join the conversation</h3>
                <p className="mt-1 text-sm text-slate-600">Sign in or create an account to reply to this discussion.</p>
              </div>
              <Link href="/info/register" className="inline-flex min-h-11 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800">
                Create free account
              </Link>
            </div>
          )
        )}

        {/* Replies */}
        <div className="space-y-2">
          {replies.length > 0 ? (
            replies.map((reply) => (
              <div key={reply.id} className={`rounded-[20px] border ${reply.is_best_answer ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} p-4`}>
                {reply.is_best_answer && (
                  <div className="mb-3 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    ✓ Best Answer
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900"><Link href={reply.user_id ? `/info/user/profile/${reply.user_id}` : '/info/user/profile'} className="hover:text-sky-700">{reply.info_users?.full_name || 'Community member'}</Link><span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">{reply.is_best_answer ? 'Trusted answer' : 'Traveler'}</span></div>
                    <div className="text-xs text-slate-500">{formatDate(reply.created_at)}</div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-700">{reply.content}</p>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => toggleLike(reply.id)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition ${
                      userLikes.has(reply.id)
                        ? 'bg-red-50 text-red-600'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Heart className={`h-3.5 w-3.5 ${userLikes.has(reply.id) ? 'fill-current' : ''}`} />
                    <span className="font-semibold">{(reply.likes || 0) + (userLikes.has(reply.id) ? 1 : 0)}</span>
                  </button>

                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">▲ {reply.upvotes ?? reply.likes ?? 0}</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 font-semibold text-slate-500">▼ {reply.downvotes ?? 0}</span>

                  <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100">
                    <Flag className="h-3.5 w-3.5" />
                    Report
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">No replies yet. Be the first to reply!</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}