'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ChevronLeft,
  Bell,
  Copy,
  MoreHorizontal,
  MessageSquare,
  Lock,
  Archive,
  Pin,
  Tag,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Gift,
  Smile,
  Send,
  Search,
  LoaderCircle,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import Reactions from '@/app/(subsystems)/info/components/user/Reactions'
import ShareRepost from '@/app/(subsystems)/info/components/user/ShareRepost'
import MentionsAutoSuggest from '@/app/(subsystems)/info/components/user/MentionsAutoSuggest'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'
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

const STICKERS = ['😀', '😂', '😍', '😎', '🤔', '😢', '😡', '🥳', '🤝', '❤️']

function isMissingForumReplyColumnError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return ['42703', 'PGRST204'].includes(code)
    || message.includes('column') && message.includes('forum_replies')
}

/**
 * The signed `daet_secure_session` cookie is the app's source of truth for who is
 * signed in (see src/proxy.js and src/lib/serverAuth.js). The Supabase browser
 * session lives in localStorage and expires/clears on its own, so a signed-in
 * member must not be treated as a guest here just because that copy is gone.
 */
async function resolveActiveUser() {
  const cookieSession = getAuthCookieFromDocument()
  const cookieUserId = cookieSession?.user_id || cookieSession?.id || cookieSession?.sub || cookieSession?.userId || null
  const cookieFallback = cookieUserId
    ? {
        id: cookieUserId,
        email: cookieSession?.user_email || cookieSession?.email || '',
        full_name: cookieSession?.user_name || cookieSession?.full_name || cookieSession?.name || '',
      }
    : null

  try {
    const { data } = await supabase.auth.getSession()
    const sessionUser = data?.session?.user
    if (sessionUser?.id) {
      return {
        id: sessionUser.id,
        email: sessionUser.email || cookieFallback?.email || '',
        full_name: sessionUser.user_metadata?.full_name || sessionUser.email || cookieFallback?.full_name || '',
      }
    }
  } catch (error) {
    console.warn('Supabase session lookup failed, falling back to the app session cookie:', error)
  }

  return cookieFallback
}

function buildReplyTree(replies = []) {
  const replyMap = new Map()
  const rootReplies = []

  replies.forEach((reply) => {
    replyMap.set(reply.id, { ...reply, children: [] })
  })

  replyMap.forEach((reply) => {
    if (reply.parent_reply_id && replyMap.has(reply.parent_reply_id)) {
      replyMap.get(reply.parent_reply_id)?.children.push(reply)
    } else {
      rootReplies.push(reply)
    }
  })

  const sortReplyTree = (items) => {
    return [...items].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((item) => ({
      ...item,
      children: sortReplyTree(item.children || []),
    }))
  }

  return sortReplyTree(rootReplies)
}

export default function ThreadDetailPage() {
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
  const [editingThread, setEditingThread] = useState(false)
  const [threadDraft, setThreadDraft] = useState({ title: '', content: '' })
  const [showPollForm, setShowPollForm] = useState(false)
  const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''], endsAt: '' })
  const [replyMedia, setReplyMedia] = useState({ image_url: '', video_url: '' })
  const [replyGifUrl, setReplyGifUrl] = useState('')
  const [replySticker, setReplySticker] = useState('')
  const [showReplyTools, setShowReplyTools] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState('')
  const isThreadOwner = Boolean(userId && thread?.created_by === userId)
  const [replyMentionRefs, setReplyMentionRefs] = useState([])
  const [replyTarget, setReplyTarget] = useState(null)
  const [replyComposerResetKey, setReplyComposerResetKey] = useState(0)
  const [editingReplyId, setEditingReplyId] = useState(null)
  const [editingReplyContent, setEditingReplyContent] = useState('')
  const [poll, setPoll] = useState(null)
  const [pollVoteIndex, setPollVoteIndex] = useState(null)
  const [pollVoteCounts, setPollVoteCounts] = useState({})
  const [votingPoll, setVotingPoll] = useState(false)
  const [showThreadMenu, setShowThreadMenu] = useState(false)
  const [pollNow, setPollNow] = useState(() => Date.now())
  const [reportTarget, setReportTarget] = useState(null)
  const [reportReason, setReportReason] = useState('Spam or misleading content')
  const [reportDescription, setReportDescription] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const pollExpired = Boolean(poll?.ends_at && new Date(poll.ends_at).getTime() <= pollNow)

  useEffect(() => {
    if (!poll?.ends_at && !showPollForm) return undefined
    const timer = window.setInterval(() => setPollNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [poll?.ends_at, showPollForm])

  const loadGifs = useCallback(async (query = gifQuery) => {
    setGifLoading(true)
    setGifError('')
    try {
      const response = await fetch(`/info/api/gifs?q=${encodeURIComponent(query || 'happy')}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to load GIFs.')
      const gifs = Array.isArray(payload.gifs) ? payload.gifs.filter((gif) => gif?.url) : []
      setGifResults(gifs)
      if (!gifs.length) setGifError('No GIFs matched your search.')
    } catch (error) {
      console.error('Failed to load forum reply GIFs:', error)
      setGifError('Could not load GIFs.')
      setGifResults([])
    } finally {
      setGifLoading(false)
    }
  }, [gifQuery])

  useEffect(() => {
    if (!showGifPicker) return undefined
    const timer = window.setTimeout(() => void loadGifs(gifQuery), 175)
    return () => window.clearTimeout(timer)
  }, [showGifPicker, gifQuery, loadGifs])

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        const activeUser = await resolveActiveUser()
        if (activeUser?.id) {
          const fullName = activeUser.full_name || activeUser.email || 'Guest'
          setUserName(fullName.split(' ')[0] || fullName)
          setUserId(activeUser.id)
        }

        if (!threadId) return

        // Load thread
        const { data: threadData, error: threadError } = await supabase
          .from('forum_threads')
          .select(
            `
            *,
            forum_categories(name),
            info_users!forum_threads_created_by_fkey(full_name, email, profile_image_url)
          `
          )
          .eq('id', threadId)
          .single()

        if (threadError) {
          console.error('Error loading thread:', threadError)
        } else if (threadData && !ignore) {
          setThread(threadData)
          setThreadDraft({ title: threadData.title || '', content: threadData.content || '' })
          const { data: pollData } = await supabase.from('content_polls').select('*').eq('content_type', 'forum_thread').eq('content_id', threadId).eq('is_active', true).maybeSingle()
          setPoll(pollData || null)
          if (pollData?.id) {
            const { data: voteRows } = await supabase.from('poll_votes').select('user_id, selected_option_index').eq('poll_id', pollData.id)
            const counts = {}
            ;(voteRows || []).forEach((vote) => {
              const index = Number(vote.selected_option_index)
              if (!Number.isInteger(index)) return
              counts[index] = (counts[index] || 0) + 1
              if (vote.user_id === activeUser?.id) setPollVoteIndex(index)
            })
            setPollVoteCounts(counts)
          }

          // Increment view count
          await supabase
            .from('forum_threads')
            .update({ views: (threadData.views || 0) + 1 })
            .eq('id', threadId)

          // Load replies
          let repliesResult = await supabase
            .from('forum_replies')
            .select(
              `
              *,
              info_users(full_name, email, profile_image_url)
            `
            )
            .eq('thread_id', threadId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })

          if (repliesResult.error && isMissingForumReplyColumnError(repliesResult.error)) {
            repliesResult = await supabase
              .from('forum_replies')
              .select('id, thread_id, user_id, parent_reply_id, content, status, created_at, updated_at, info_users(full_name, email, profile_image_url)')
              .eq('thread_id', threadId)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
          }
          if (repliesResult.error) throw repliesResult.error
          const repliesData = repliesResult.data || []
          const replyUserIds = [...new Set(repliesData.map((reply) => reply.user_id).filter(Boolean))]
          let replyProfiles = []
          if (replyUserIds.length) {
            const { data: profileRows, error: profileError } = await supabase
              .from('profiles')
              .select('user_id, profile_image_url')
              .in('user_id', replyUserIds)
            if (profileError) console.warn('Reply profile images could not be loaded:', profileError.message)
            replyProfiles = profileRows || []
          }
          const profileImageByUserId = new Map(replyProfiles.map((profile) => [profile.user_id, profile.profile_image_url]))
          const repliesWithProfiles = repliesData.map((reply) => ({
            ...reply,
            parent_reply_id: reply.parent_reply_id || null,
            info_users: {
              ...(reply.info_users || {}),
              profile_image_url: reply.info_users?.profile_image_url || profileImageByUserId.get(reply.user_id) || null,
            },
          }))
          setReplies(repliesWithProfiles)

          // Check if subscribed
          if (activeUser?.id) {
            const { data: subData } = await supabase
              .from('forum_subscriptions')
              .select('id')
              .eq('thread_id', threadId)
              .eq('user_id', activeUser.id)
              .single()

            setIsSubscribed(!!subData)
          }
        }

        if (!ignore) {
          setLoading(false)
        }
      } catch (error) {
        console.error('Thread fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [threadId])

  const handleSubscribe = async () => {
    if (!userId) {
      alert('Please log in to subscribe')
      return
    }

    try {
      if (isSubscribed) {
        const { error } = await supabase
          .from('forum_subscriptions')
          .delete()
          .eq('thread_id', threadId)
          .eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('forum_subscriptions').upsert({
          thread_id: threadId,
          user_id: userId,
        }, { onConflict: 'thread_id,user_id' })
        if (error) throw error
      }

      setIsSubscribed(!isSubscribed)
      alert(isSubscribed ? 'Thread notifications turned off.' : 'Thread notifications turned on.')
    } catch (error) {
      console.error('Error toggling subscription:', error)
      alert(error?.message || 'Unable to update thread notifications right now.')
    }
  }

  const copyThreadLink = async () => {
    try {
      const link = window.location.href
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const input = document.createElement('textarea')
        input.value = link
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error('Clipboard access is unavailable.')
      }
      setShowThreadMenu(false)
      alert('Link copied to clipboard.')
    } catch (error) {
      console.error('Forum thread link copy failed:', error)
      alert('Unable to copy the discussion link.')
    }
  }

  const resetReplyComposer = () => {
    setReplyContent('')
    setReplyMedia({ image_url: '', video_url: '' })
    setReplyMentionRefs([])
    setReplyGifUrl('')
    setReplySticker('')
    setShowReplyTools(false)
    setShowGifPicker(false)
    setShowStickerPicker(false)
    setReplyTarget(null)
    setReplyComposerResetKey((value) => value + 1)
  }

  const reloadReplies = useCallback(async () => {
    const { data: newReplies, error: reloadError } = await supabase
      .from('forum_replies')
      .select(
        `
        *,
        info_users(full_name, email, profile_image_url)
      `
      )
      .eq('thread_id', threadId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (reloadError) throw reloadError
    setReplies(newReplies || [])
    return newReplies || []
  }, [threadId])

  const handleReplySubmit = async () => {
    if (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker) return

    setSubmittingReply(true)
    try {
      if (!userId) {
        alert('Please log in to reply')
        return
      }

      // Posted through /info/api/forum-replies so the write is authorised by the signed
      // session cookie instead of a Supabase browser session (RLS `auth.uid()`).
      const response = await fetch('/info/api/forum-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          content: replyContent.trim(),
          parentReplyId: replyTarget?.id || null,
          imageUrl: replyMedia.image_url || null,
          videoUrl: replyMedia.video_url || null,
          gifUrl: replyGifUrl || null,
          stickerUrl: replySticker || null,
          mentionData: replyMentionRefs
            .filter((mention) => mention?.id && !String(mention.id).startsWith('mention-'))
            .map((mention) => ({ mentioned_user_id: mention.id, display_name: mention.displayName })),
        }),
      })

      const payload = await response.json().catch(() => ({ success: false, message: 'Unable to post the reply.' }))
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to post the reply.')
      }

      resetReplyComposer()
      await reloadReplies()
    } catch (error) {
      console.error('Error submitting reply:', error)
      alert(error?.message || 'An error occurred. Please try again.')
    } finally {
      setSubmittingReply(false)
    }
  }

  const saveThread = async () => {
    const { data, error } = await supabase.from('forum_threads').update({
      title: threadDraft.title.trim(),
      content: threadDraft.content.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', threadId).eq('created_by', userId).select('*').single()
    if (error) return alert(error.message || 'Unable to update the discussion.')
    setThread((current) => ({ ...current, ...data }))
    setEditingThread(false)
  }

  const unpublishThread = async () => {
    if (!window.confirm('Unpublish this discussion?')) return
    const { error } = await supabase.from('forum_threads').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', threadId).eq('created_by', userId)
    if (error) return alert(error.message || 'Unable to unpublish the discussion.')
    setThread((current) => ({ ...current, status: 'draft' }))
  }

  const deleteReply = async (replyId) => {
    if (!window.confirm('Delete this comment?')) return
    try {
      const response = await fetch(`/info/api/forum-replies?replyId=${encodeURIComponent(replyId)}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => ({ success: false, message: 'Unable to delete the comment.' }))
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to delete the comment.')
      }
      setReplies((current) => current.filter((reply) => reply.id !== replyId))
    } catch (error) {
      alert(error?.message || 'Unable to delete the comment.')
    }
  }

  const saveReplyEdit = async (replyId) => {
    const content = editingReplyContent.trim()
    if (!content) return
    try {
      const response = await fetch('/info/api/forum-replies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyId, content }),
      })
      const payload = await response.json().catch(() => ({ success: false, message: 'Unable to edit the comment.' }))
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to edit the comment.')
      }
      setReplies((current) => current.map((reply) => reply.id === replyId ? { ...reply, content } : reply))
      setEditingReplyId(null)
      setEditingReplyContent('')
    } catch (error) {
      alert(error?.message || 'Unable to edit the comment.')
    }
  }

  const submitReplyReport = async () => {
    if (!userId) {
      alert('Please log in to report a reply.')
      return
    }
    if (!reportTarget || !reportReason || userId === reportTarget.user_id) return

    setSubmittingReport(true)
    try {
      const response = await fetch('/info/api/reports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'forum_reply',
          reason: reportReason,
          description: reportDescription.trim(),
          itemId: reportTarget.id,
          itemTable: 'forum_replies',
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to submit this report.')
      setReportTarget(null)
      setReportReason('Spam or misleading content')
      setReportDescription('')
      alert('Thank you. The reply has been reported for review.')
    } catch (error) {
      console.error('Reply report submission failed:', error)
      alert(error?.message || 'Unable to submit this report right now.')
    } finally {
      setSubmittingReport(false)
    }
  }

  const createPoll = async () => {
    const options = pollDraft.options.map((option) => option.trim()).filter(Boolean)
    if (!pollDraft.question.trim() || options.length < 2) return alert('Add a question and at least two options.')
    const endsAt = pollDraft.endsAt ? new Date(pollDraft.endsAt) : null
    if (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) return alert('Choose a future poll deadline.')
    const { data, error } = await supabase.from('content_polls').insert({
      content_type: 'forum_thread',
      content_id: threadId,
      created_by: userId,
      question: pollDraft.question.trim(),
      options,
      ends_at: endsAt ? endsAt.toISOString() : null,
    }).select('*').single()
    if (error) return alert(error.message || 'Unable to add the poll.')
    setPoll(data)
    setPollDraft({ question: '', options: ['', ''], endsAt: '' })
    setShowPollForm(false)
  }

  const voteInPoll = async (optionIndex) => {
    if (!userId) {
      alert('Please log in to vote.')
      return
    }
    if (!poll?.id || pollVoteIndex !== null || votingPoll || pollExpired) return

    setVotingPoll(true)
    const { error } = await supabase.from('poll_votes').insert({
      poll_id: poll.id,
      user_id: userId,
      selected_option_index: optionIndex,
    })
    if (error) {
      console.error('Poll vote failed:', error)
      alert(error.message || 'Unable to submit your vote.')
    } else {
      setPollVoteIndex(optionIndex)
      setPollVoteCounts((current) => ({ ...current, [optionIndex]: (current[optionIndex] || 0) + 1 }))
      setPoll((current) => ({ ...current, total_votes: (current?.total_votes || 0) + 1 }))
    }
    setVotingPoll(false)
  }

  const renderReplyTree = (reply, depth = 0) => {
    const isOwnReply = Boolean(userId && reply.user_id === userId)
    const isReplyingToThis = Boolean(replyTarget && replyTarget.id === reply.id)

    return (
      <article key={reply.id} className={`forum-view-reply feed-card ${reply.is_best_answer ? 'is-best-answer' : ''} ${depth > 0 ? 'is-nested' : ''}`}>
        {reply.is_best_answer && (
          <div className="forum-view-best-answer">
            ✓ Best Answer
          </div>
        )}

        <div className="forum-view-reply-header">
          <div className="forum-view-reply-author">
            <Link
              href={reply.user_id ? `/info/user/profile/${encodeURIComponent(reply.user_id)}` : '/info/user/profile'}
              className="forum-view-reply-avatar"
              aria-label={`View ${reply.info_users?.full_name || reply.info_users?.email || 'Anonymous'}'s profile`}
            >
              {reply.info_users?.profile_image_url ? (
                <img src={reply.info_users.profile_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (reply.info_users?.full_name || reply.info_users?.email || 'A').charAt(0).toUpperCase()
              )}
            </Link>
            <div className="min-w-0">
              <Link
                href={reply.user_id ? `/info/user/profile/${encodeURIComponent(reply.user_id)}` : '/info/user/profile'}
                className="forum-view-reply-author-name"
              >
                {reply.info_users?.full_name || reply.info_users?.email || 'Anonymous'}
              </Link>
              <time className="forum-view-reply-time" dateTime={reply.created_at}>{formatDate(reply.created_at)}</time>
            </div>
          </div>
          {!isOwnReply && (
            <div className="flex items-center gap-1">
              {userId && <button type="button" onClick={() => setReportTarget(reply)} className="inline-flex h-8 items-center justify-center rounded-full bg-slate-50 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">Report</button>}
            </div>
          )}
          {isOwnReply && (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setEditingReplyId(reply.id); setEditingReplyContent(reply.content || '') }} aria-label="Edit comment" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => deleteReply(reply.id)} aria-label="Delete comment" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        {editingReplyId === reply.id ? <div className="forum-view-reply-edit"><textarea value={editingReplyContent} onChange={(event) => setEditingReplyContent(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => saveReplyEdit(reply.id)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Save</button><button type="button" onClick={() => setEditingReplyId(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button></div></div> : <p className="forum-view-reply-content">{reply.content}</p>}
        {reply.image_url && <img src={reply.image_url} alt="Comment attachment" className="mt-3 max-h-64 rounded-xl object-cover" />}
        {reply.video_url && <video src={reply.video_url} controls className="mt-3 max-h-64 rounded-xl" />}
        {reply.gif_url && <img src={reply.gif_url} alt="GIF" className="mt-3 max-h-48 rounded-xl" />}
        {reply.sticker_url && <span className="mt-2 block text-3xl">{reply.sticker_url}</span>}

        <div className="forum-view-reply-actions">
          <Reactions contentType="forum_reply" contentId={reply.id} userId={userId} voteControls />
          <button
            type="button"
            onClick={() => setReplyTarget(isReplyingToThis ? null : reply)}
            aria-expanded={isReplyingToThis}
            className={`forum-view-reply-action ${
              isReplyingToThis
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700'
            }`}
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Reply
          </button>
        </div>

        {isReplyingToThis && (
          <div className="forum-view-nested-composer">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Replying to {reply.info_users?.full_name || 'this reply'}</p>
            <MentionsAutoSuggest value={replyContent} onChange={setReplyContent} placeholder="Write a reply to this comment..." rows={2} userId={userId} onMentionAdded={(mention) => setReplyMentionRefs((current) => [...current.filter((item) => item.id !== mention.id), { id: mention.id, displayName: mention.mentionToken || mention.full_name }])} />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setReplyTarget(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
              <button type="button" onClick={handleReplySubmit} disabled={submittingReply || (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">{submittingReply ? 'Posting...' : 'Reply'}</button>
            </div>
          </div>
        )}

        {reply.children?.length > 0 && (
          <div className="forum-view-reply-children">
            {reply.children.map((child) => renderReplyTree(child, depth + 1))}
          </div>
        )}
      </article>
    )
  }

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-detail min-h-screen text-slate-900">
        <div className="usr-section-container mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-5 lg:px-6 lg:pb-10">
          <div className="usr-section-loading">
            {[0, 1].map((item) => (
              <div key={item} className="usr-card p-5">
                <div className="usr-section-skeleton h-4 w-1/3 rounded-full" />
                <div className="usr-section-skeleton mt-3 h-3 w-full rounded-full" />
                <div className="usr-section-skeleton mt-2 h-3 w-4/5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (!thread) {
    return (
      <main className="tourism-shell usr-section-page usr-detail flex min-h-screen items-center justify-center p-6 text-slate-900">
        <div className="usr-empty-state max-w-xl">
          <MessageSquare className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Thread not found</p>
          <p className="mt-1 text-xs text-slate-500">This discussion may have been archived, locked, or removed by its author.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/info/user/dashboard" className="usr-section-primary">Back to feed</Link>
          </div>
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
    <main className="tourism-shell usr-section-page usr-detail forum-thread-view min-h-screen text-slate-900">
      <div className="usr-section-container forum-thread-view-container mx-auto w-full max-w-2xl px-3 pb-24 pt-3 sm:px-5 lg:px-6 lg:pb-10">
        <div className="forum-view-topbar">
          <Link
            href="/info/user/dashboard"
            className="forum-view-back"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Back</span>
          </Link>
          <div className="forum-view-top-actions">
            <button type="button" onClick={handleSubscribe} className={`forum-view-icon ${isSubscribed ? 'is-active' : ''}`} title={isSubscribed ? 'Unsubscribe' : 'Subscribe'} aria-label={isSubscribed ? 'Turn off notifications' : 'Turn on notifications'}>
              <Bell className={`h-4 w-4 ${isSubscribed ? 'fill-current' : ''}`} />
            </button>
            <button type="button" onClick={copyThreadLink} className="forum-view-icon" title="Copy discussion link" aria-label="Copy discussion link"><Copy className="h-4 w-4" /></button>
            <div className="forum-view-menu-wrap">
              <button type="button" onClick={() => setShowThreadMenu((open) => !open)} className="forum-view-icon" aria-label="Discussion options" aria-haspopup="menu" aria-expanded={showThreadMenu}>
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showThreadMenu && (
                <div className="forum-view-menu" role="menu">
                  <ShareRepost contentType="forum_thread" contentId={threadId} userId={userId} />
                  {isThreadOwner && (
                    <>
                      <button type="button" role="menuitem" onClick={() => { setEditingThread(true); setShowThreadMenu(false) }}><Pencil className="h-4 w-4" />Edit discussion</button>
                      <button type="button" role="menuitem" onClick={() => { setShowPollForm((value) => !value); setShowThreadMenu(false) }}><Plus className="h-4 w-4" />Add poll</button>
                      <button type="button" role="menuitem" onClick={() => { setShowThreadMenu(false); unpublishThread() }}><Archive className="h-4 w-4" />Unpublish</button>
                    </>
                  )}
                  <button type="button" role="menuitem" onClick={copyThreadLink}><Copy className="h-4 w-4" />Copy link</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Thread */}
        <article className="forum-view-thread tourism-panel">
          <div className="forum-view-thread-heading">
            <div className="min-w-0 flex-1">
              <div className="forum-view-title-row">
                {thread.pinned && <Pin className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                {editingThread ? <input value={threadDraft.title} onChange={(event) => setThreadDraft((current) => ({ ...current, title: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xl font-black outline-none" /> : <h1>{thread.title}</h1>}
                <div className={`forum-view-status ${getStatusColor(thread.status)}`} aria-label={`Thread status: ${thread.status}`}>
                  {thread.status === 'published' || thread.status === 'active' ? '✓' : thread.status === 'locked' ? '🔒' : '📦'}
                </div>
              </div>

              <div className="forum-view-author-row">
                <span className="forum-view-author-avatar">
                  {thread.info_users?.profile_image_url
                    ? <img src={thread.info_users.profile_image_url} alt="" />
                    : (thread.info_users?.full_name || thread.info_users?.email || 'A').charAt(0).toUpperCase()}
                </span>
                <span className="forum-view-author-name">{thread.info_users?.full_name || thread.info_users?.email || 'Anonymous'}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={thread.created_at}>{formatDate(thread.created_at)}</time>
                {thread.forum_categories?.name && <span className="forum-view-category">{thread.forum_categories.name}</span>}
              </div>
            </div>
          </div>

          {thread.tags && thread.tags.length > 0 && (
            <div className="forum-view-tags">
              {thread.tags.map((tag, idx) => (
                <span key={idx}><Tag className="h-3 w-3" />{tag}</span>
              ))}
            </div>
          )}

          {editingThread ? <textarea value={threadDraft.content} onChange={(event) => setThreadDraft((current) => ({ ...current, content: event.target.value }))} rows={5} className="forum-view-content-edit" /> : <div className="forum-view-content">{parsedThreadContent.text}</div>}
          {thread.location && <p className="forum-view-location">📍 {thread.location}</p>}
          {threadAttachments.length > 0 && (
            <div className="forum-view-attachments">
              {threadAttachments.map((url, index) => (
                <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer">
                  {isImageAttachment(url)
                    ? <img src={url} alt={`Discussion attachment ${index + 1}`} />
                    : <span>Open attachment {index + 1}</span>}
                </a>
              ))}
            </div>
          )}

          {isThreadOwner && editingThread && <div className="forum-view-owner-actions">
            <button type="button" onClick={saveThread} className="forum-view-owner-primary">Save changes</button>
            <button type="button" onClick={() => setEditingThread(false)}>Cancel</button>
          </div>}

          {isThreadOwner && showPollForm && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><input value={pollDraft.question} onChange={(event) => setPollDraft((current) => ({ ...current, question: event.target.value }))} placeholder="Poll question" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /><label className="mt-2 block text-xs font-semibold text-slate-600">Poll deadline<input required type="datetime-local" value={pollDraft.endsAt} min={new Date(pollNow + 60000 - new Date(pollNow + 60000).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(event) => setPollDraft((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /></label><div className="mt-2 space-y-2">{pollDraft.options.map((option, index) => <div key={index} className="flex items-center gap-2"><input value={option} onChange={(event) => setPollDraft((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`Option ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />{pollDraft.options.length > 2 && <button type="button" onClick={() => setPollDraft((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50" aria-label={`Remove option ${index + 1}`}>Remove</button>}</div>)}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPollDraft((current) => ({ ...current, options: [...current.options, ''] }))} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-slate-200 hover:bg-sky-50">Add choice</button><button type="button" onClick={createPoll} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Create poll</button></div></div>}
          {poll && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-bold text-slate-900">{poll.question}</p>{poll.ends_at ? <p className={`mt-1 text-xs font-semibold ${pollExpired ? 'text-red-600' : 'text-slate-500'}`}>{pollExpired ? 'Voting closed' : `Voting ends ${new Date(poll.ends_at).toLocaleString()}`}</p> : null}<p className="mt-1 text-xs text-slate-500">{pollExpired ? 'This poll has ended.' : pollVoteIndex === null ? 'Choose one option to vote.' : 'Your vote has been recorded.'}</p><div className="mt-3 space-y-2">{(poll.options || []).map((option, index) => <button key={`${option}-${index}`} type="button" onClick={() => voteInPoll(index)} disabled={pollExpired || pollVoteIndex !== null || votingPoll} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${pollVoteIndex === index ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'} disabled:cursor-not-allowed disabled:opacity-60`}><span>{option}</span><span className="text-xs text-slate-400">{pollVoteCounts[index] || 0} votes</span></button>)}</div><p className="mt-3 text-right text-xs font-semibold text-slate-500">{Object.values(pollVoteCounts).reduce((total, count) => total + count, 0)} total votes</p></div>}

          <div className="forum-view-thread-actions">
            <Reactions contentType="forum_thread" contentId={thread.id} userId={userId} compact />
            <a href="#forum-replies" className="forum-view-replies-action"><MessageSquare className="h-4 w-4" />{replies.length}</a>
            <ShareRepost contentType="forum_thread" contentId={threadId} userId={userId} />
            <span className="forum-view-views"><Eye className="h-4 w-4" />{(thread.views || 0) + 1}</span>
            {thread.status === 'locked' && <span className="forum-view-locked"><Lock className="h-4 w-4" />Locked</span>}
          </div>
        </article>

        {/* Reply Form */}
        {thread.status !== 'locked' && thread.status !== 'archived' && (
            <div className="forum-view-composer mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="forum-view-composer-title mb-3 text-sm font-bold text-slate-900">Share Your Reply</h3>

              <div className="forum-view-composer-field rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <MentionsAutoSuggest value={replyContent} onChange={setReplyContent} placeholder="Share your thoughts, links, or mention someone..." rows={3} userId={userId} onMentionAdded={(mention) => setReplyMentionRefs((current) => [...current.filter((item) => item.id !== mention.id), { id: mention.id, displayName: mention.mentionToken || mention.full_name }])} />
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setShowReplyTools((value) => !value)} aria-label="Add photo or video" title="Add photo or video" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white hover:text-sky-700 ${showReplyTools ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}><Plus className="h-5 w-5" /></button>
                  <button type="button" onClick={() => { setShowGifPicker((value) => !value); setShowStickerPicker(false) }} aria-label="Add GIF" title="Add GIF" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white hover:text-sky-700 ${replyGifUrl || showGifPicker ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}><Gift className="h-4 w-4" /></button>
                  <button type="button" onClick={() => { setShowStickerPicker((value) => !value); setShowGifPicker(false) }} aria-label="Add sticker" title="Add sticker" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-white hover:text-sky-700 ${replySticker || showStickerPicker ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}><Smile className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={handleReplySubmit} disabled={submittingReply || (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker)} aria-label="Post reply" title="Post reply" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" /><span>{submittingReply ? 'Posting…' : 'Reply'}</span></button>
              </div>
            </div>
            {(replyGifUrl || replySticker) && <div className="mt-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-2">{replyGifUrl ? <img src={replyGifUrl} alt="Selected GIF preview" className="h-20 max-w-36 rounded-lg object-cover" /> : null}{replySticker ? <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-white text-4xl">{replySticker}</span> : null}<button type="button" onClick={() => { setReplyGifUrl(''); setReplySticker('') }} className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 hover:bg-slate-100 hover:text-red-600" aria-label="Remove selected GIF or sticker" title="Remove preview"><X className="h-4 w-4" /></button></div>}
            {showReplyTools && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"><MediaUpload key={replyComposerResetKey} bucket="post-media" folder={`forum-replies/${userId}/${threadId}`} mediaType="image" buttonText="Add photo" maxSizeMB={10} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, image_url: url || '' }))} onUploadError={(message) => alert(message)} /><MediaUpload key={`${replyComposerResetKey}-video`} bucket="post-media" folder={`forum-replies/${userId}/${threadId}`} mediaType="video" buttonText="Add video" maxSizeMB={20} maxVideoDuration={30} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, video_url: url || '' }))} onUploadError={(message) => alert(message)} /></div>}

            {showGifPicker && <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} placeholder="Search GIFs..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>{gifLoading ? <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading GIFs...</div> : gifError ? <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">{gifError}</div> : <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto p-2">{gifResults.map((gif) => <button key={gif.id || gif.url} type="button" onClick={() => { setReplyGifUrl(gif.url); setReplySticker(''); setShowGifPicker(false); setGifQuery('') }} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50 hover:ring-2 hover:ring-sky-500"><img src={gif.url} alt={gif.title || 'GIF'} className="h-20 w-full object-cover" /></button>)}</div>}</div>}
            {showStickerPicker && <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2">{STICKERS.map((sticker) => <button key={sticker} type="button" onClick={() => { setReplySticker(sticker); setReplyGifUrl(''); setShowStickerPicker(false) }} className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-slate-100">{sticker}</button>)}</div>}

          </div>
        )}

        <section id="forum-replies" className="forum-view-replies mt-3 space-y-0 lg:mt-0">
          <h2 className="forum-view-replies-heading"><MessageSquare className="h-4 w-4" />{replies.length} {replies.length === 1 ? 'Reply' : 'Replies'}</h2>
          {replies.length > 0 ? (
            buildReplyTree(replies).map((reply) => renderReplyTree(reply))
          ) : (
            <div className="forum-view-empty-replies rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">No replies yet. Be the first to reply!</p>
            </div>
          )}
        </section>
      </div>

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true" aria-labelledby="report-reply-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="report-reply-title" className="text-base font-bold text-slate-900">Report reply</h2>
                <p className="mt-1 text-xs text-slate-500">Tell us why this reply should be reviewed.</p>
              </div>
              <button type="button" onClick={() => setReportTarget(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="Close report dialog"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-700">Reason
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-sky-400">
                <option>Spam or misleading content</option>
                <option>Harassment or bullying</option>
                <option>Hate speech or discrimination</option>
                <option>Inappropriate or offensive content</option>
                <option>Scam or fraud</option>
                <option>Other</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-700">Additional details <span className="font-normal text-slate-400">(optional)</span>
              <textarea value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} rows={3} maxLength={500} placeholder="Add context for the moderators..." className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-sky-400" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setReportTarget(null)} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
              <button type="button" onClick={submitReplyReport} disabled={submittingReport} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">{submittingReport ? 'Submitting...' : 'Submit report'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
