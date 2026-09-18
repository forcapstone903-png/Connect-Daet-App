'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  Flag,
  Clock,
  User,
  Lock,
  Archive,
  Pin,
  Tag,
  Eye,
  MoreHorizontal,
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
import Reactions from '@/app/components/user/Reactions'
import ShareRepost from '@/app/components/user/ShareRepost'
import MentionsAutoSuggest from '@/app/components/user/MentionsAutoSuggest'
import MediaUpload from '@/app/components/MediaUpload'

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
  const [editingReplyId, setEditingReplyId] = useState(null)
  const [editingReplyContent, setEditingReplyContent] = useState('')
  const [poll, setPoll] = useState(null)
  const [pollVoteIndex, setPollVoteIndex] = useState(null)
  const [pollVoteCounts, setPollVoteCounts] = useState({})
  const [votingPoll, setVotingPoll] = useState(false)
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
      const response = await fetch(`/api/gifs?q=${encodeURIComponent(query || 'happy')}`)
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
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Guest'
          setUserName(fullName.split(' ')[0] || fullName)
          setUserId(session.user.id)
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
              if (vote.user_id === session?.user?.id) setPollVoteIndex(index)
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
            .order('created_at', { ascending: true })

          if (repliesResult.error && isMissingForumReplyColumnError(repliesResult.error)) {
            repliesResult = await supabase
              .from('forum_replies')
              .select('id, thread_id, user_id, content, status, created_at, updated_at, info_users(full_name, email, profile_image_url)')
              .eq('thread_id', threadId)
              .eq('status', 'active')
              .order('created_at', { ascending: true })
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
            info_users: {
              ...(reply.info_users || {}),
              profile_image_url: reply.info_users?.profile_image_url || profileImageByUserId.get(reply.user_id) || null,
            },
          }))
          setReplies(repliesWithProfiles)

          // Check if subscribed
          if (session?.user?.id) {
            const { data: subData } = await supabase
              .from('forum_subscriptions')
              .select('id')
              .eq('thread_id', threadId)
              .eq('user_id', session.user.id)
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

  const handleReplySubmit = async () => {
    if (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker) return

    setSubmittingReply(true)
    try {
      if (!userId) {
        alert('Please log in to reply')
        return
      }

      const replyPayload = {
        thread_id: threadId,
        user_id: userId,
        content: replyContent.trim(),
        image_url: replyMedia.image_url || null,
        video_url: replyMedia.video_url || null,
        gif_url: replyGifUrl || null,
        sticker_url: replySticker || null,
        mention_data: replyMentionRefs.filter((mention) => mention?.id && !String(mention.id).startsWith('mention-')).map((mention) => ({ mentioned_user_id: mention.id, display_name: mention.displayName })),
        status: 'active',
      }
      let replyResult = await supabase.from('forum_replies').insert(replyPayload)
      if (replyResult.error && isMissingForumReplyColumnError(replyResult.error)) {
        const { image_url: _imageUrl, video_url: _videoUrl, gif_url: _gifUrl, sticker_url: _stickerUrl, mention_data: _mentionData, ...legacyReplyPayload } = replyPayload
        replyResult = await supabase.from('forum_replies').insert(legacyReplyPayload)
      }
      const { error } = replyResult

      if (error) {
        console.error('Error posting reply:', error)
        alert('Failed to post reply')
      } else {
        setReplyContent('')
        setReplyMedia({ image_url: '', video_url: '' })
        setReplyMentionRefs([])
        setReplyGifUrl('')
        setReplySticker('')
        // Reload replies
        const { data: newReplies, error: reloadError } = await supabase
          .from('forum_replies')
          .select(
            `
            *,
            info_users(full_name, email)
          `
          )
          .eq('thread_id', threadId)
          .eq('status', 'active')
          .order('created_at', { ascending: true })

        if (reloadError) throw reloadError
        setReplies(newReplies || [])
      }
    } catch (error) {
      console.error('Error submitting reply:', error)
      alert('An error occurred. Please try again.')
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
    const { error } = await supabase.from('forum_replies').delete().eq('id', replyId).eq('user_id', userId)
    if (error) return alert(error.message || 'Unable to delete the comment.')
    setReplies((current) => current.filter((reply) => reply.id !== replyId))
  }

  const saveReplyEdit = async (replyId) => {
    const content = editingReplyContent.trim()
    if (!content) return
    const { error } = await supabase.from('forum_replies').update({ content, updated_at: new Date().toISOString() }).eq('id', replyId).eq('user_id', userId)
    if (error) return alert(error.message || 'Unable to edit the comment.')
    setReplies((current) => current.map((reply) => reply.id === replyId ? { ...reply, content } : reply))
    setEditingReplyId(null)
    setEditingReplyContent('')
  }

  const submitReplyReport = async () => {
    if (!userId) {
      alert('Please log in to report a reply.')
      return
    }
    if (!reportTarget || !reportReason) return

    setSubmittingReport(true)
    try {
      const { error } = await supabase.from('info_moderation').insert({
        report_type: 'forum_reply',
        reason: reportReason,
        description: reportDescription.trim() || null,
        reported_by: userId,
        reported_user_id: reportTarget.user_id || null,
        reported_item_id: reportTarget.id,
        reported_item_table: 'forum_replies',
        severity: 'medium',
        status: 'pending',
      })
      if (error) throw error
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
            <Link href="/user/forums" className="usr-section-primary">Back to forums</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell usr-section-page usr-detail min-h-screen text-slate-900">
      <div className="usr-section-container mx-auto w-full max-w-[1280px] px-3 pb-24 pt-3 sm:px-5 lg:px-6 lg:pb-10">
        {/* Header */}
        <div className="usr-card mb-4 flex items-center justify-between px-3 py-3 sm:px-4">
          <Link
            href="/user/forums"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div className="flex items-center gap-2">
            <ShareRepost contentType="forum_thread" contentId={threadId} userId={userId} />
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start lg:gap-5">
        <div>
        {/* Thread */}
        <div className="tourism-panel mb-3 rounded-[18px] border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {thread.pinned && <Pin className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                {editingThread ? <input value={threadDraft.title} onChange={(event) => setThreadDraft((current) => ({ ...current, title: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xl font-black outline-none" /> : <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-950 break-words">{thread.title}</h1>}
              </div>

              <div className="mt-2 text-sm text-slate-600">
                {thread.forum_categories && (
                  <span className="inline-block rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                    {thread.forum_categories.name}
                  </span>
                )}
              </div>

              {/* Tags */}
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
              {thread.status === 'active' ? '✓' : thread.status === 'locked' ? '🔒' : '📦'} {thread.status}
            </div>
          </div>

          {editingThread ? <textarea value={threadDraft.content} onChange={(event) => setThreadDraft((current) => ({ ...current, content: event.target.value }))} rows={5} className="mt-5 w-full rounded-lg border border-slate-200 p-3 text-[15px] leading-7 outline-none" /> : <div className="mt-5 text-[15px] leading-7 text-slate-700">{thread.content}</div>}

          {isThreadOwner && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            {editingThread ? <><button type="button" onClick={saveThread} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Save changes</button><button type="button" onClick={() => setEditingThread(false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button></> : <button type="button" onClick={() => setEditingThread(true)} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
            {!editingThread && <button type="button" onClick={unpublishThread} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Unpublish</button>}
            <button type="button" onClick={() => setShowPollForm((value) => !value)} className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700"><Plus className="h-3.5 w-3.5" /> Add poll</button>
          </div>}

          {isThreadOwner && showPollForm && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><input value={pollDraft.question} onChange={(event) => setPollDraft((current) => ({ ...current, question: event.target.value }))} placeholder="Poll question" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /><label className="mt-2 block text-xs font-semibold text-slate-600">Poll deadline<input required type="datetime-local" value={pollDraft.endsAt} min={new Date(pollNow + 60000 - new Date(pollNow + 60000).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(event) => setPollDraft((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /></label><div className="mt-2 space-y-2">{pollDraft.options.map((option, index) => <div key={index} className="flex items-center gap-2"><input value={option} onChange={(event) => setPollDraft((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`Option ${index + 1}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />{pollDraft.options.length > 2 && <button type="button" onClick={() => setPollDraft((current) => ({ ...current, options: current.options.filter((_, itemIndex) => itemIndex !== index) }))} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50" aria-label={`Remove option ${index + 1}`}>Remove</button>}</div>)}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPollDraft((current) => ({ ...current, options: [...current.options, ''] }))} className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-slate-200 hover:bg-sky-50">Add choice</button><button type="button" onClick={createPoll} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Create poll</button></div></div>}
          {poll && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-bold text-slate-900">{poll.question}</p>{poll.ends_at ? <p className={`mt-1 text-xs font-semibold ${pollExpired ? 'text-red-600' : 'text-slate-500'}`}>{pollExpired ? 'Voting closed' : `Voting ends ${new Date(poll.ends_at).toLocaleString()}`}</p> : null}<p className="mt-1 text-xs text-slate-500">{pollExpired ? 'This poll has ended.' : pollVoteIndex === null ? 'Choose one option to vote.' : 'Your vote has been recorded.'}</p><div className="mt-3 space-y-2">{(poll.options || []).map((option, index) => <button key={`${option}-${index}`} type="button" onClick={() => voteInPoll(index)} disabled={pollExpired || pollVoteIndex !== null || votingPoll} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${pollVoteIndex === index ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'} disabled:cursor-not-allowed disabled:opacity-60`}><span>{option}</span><span className="text-xs text-slate-400">{pollVoteCounts[index] || 0} votes</span></button>)}</div><p className="mt-3 text-right text-xs font-semibold text-slate-500">{Object.values(pollVoteCounts).reduce((total, count) => total + count, 0)} total votes</p></div>}

          {/* Thread Meta */}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {thread.info_users?.full_name || thread.info_users?.email || 'Anonymous'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatDate(thread.created_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {(thread.views || 0) + 1} views
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
          <div className="mb-3 rounded-[18px] border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-bold text-slate-900">Share Your Reply</h3>

              <div className="mt-3 flex items-center gap-1 rounded-[18px] border border-slate-200 bg-slate-50 p-1.5">
              <button type="button" onClick={() => setShowReplyTools((value) => !value)} aria-label="Add photo or video" title="Add photo or video" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-sky-700"><Plus className="h-5 w-5" /></button>
                <button type="button" onClick={() => { setShowGifPicker((value) => !value); setShowStickerPicker(false) }} aria-label="Add GIF" title="Add GIF" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-sky-700 ${replyGifUrl ? 'bg-white text-sky-700' : ''}`}><Gift className="h-4 w-4" /></button>
                <button type="button" onClick={() => { setShowStickerPicker((value) => !value); setShowGifPicker(false) }} aria-label="Add sticker" title="Add sticker" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-sky-700 ${replySticker ? 'bg-white text-sky-700' : ''}`}><Smile className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1"><MentionsAutoSuggest value={replyContent} onChange={setReplyContent} placeholder="Share your thoughts, links, or mention someone..." rows={1} userId={userId} onMentionAdded={(mention) => setReplyMentionRefs((current) => [...current.filter((item) => item.id !== mention.id), { id: mention.id, displayName: mention.mentionToken || mention.full_name }])} /></div>
              <button type="button" onClick={handleReplySubmit} disabled={submittingReply || (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker)} aria-label="Post reply" title="Post reply" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
            </div>
            {(replyGifUrl || replySticker) && <div className="mt-2 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-2">{replyGifUrl ? <img src={replyGifUrl} alt="Selected GIF preview" className="h-20 max-w-36 rounded-lg object-cover" /> : null}{replySticker ? <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-white text-4xl">{replySticker}</span> : null}<button type="button" onClick={() => { setReplyGifUrl(''); setReplySticker('') }} className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 hover:bg-slate-100 hover:text-red-600" aria-label="Remove selected GIF or sticker" title="Remove preview"><X className="h-4 w-4" /></button></div>}
            {showReplyTools && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"><MediaUpload bucket="post-media" folder={`forum-replies/${userId}/${threadId}`} mediaType="image" buttonText="Add photo" maxSizeMB={10} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, image_url: url || '' }))} /><MediaUpload bucket="post-media" folder={`forum-replies/${userId}/${threadId}`} mediaType="video" buttonText="Add video" maxSizeMB={20} maxVideoDuration={30} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, video_url: url || '' }))} /></div>}

            {showGifPicker && <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} placeholder="Search GIFs..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>{gifLoading ? <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs font-semibold text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading GIFs...</div> : gifError ? <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">{gifError}</div> : <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto p-2">{gifResults.map((gif) => <button key={gif.id || gif.url} type="button" onClick={() => { setReplyGifUrl(gif.url); setReplySticker(''); setShowGifPicker(false); setGifQuery('') }} className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50 hover:ring-2 hover:ring-sky-500"><img src={gif.url} alt={gif.title || 'GIF'} className="h-20 w-full object-cover" /></button>)}</div>}</div>}
            {showStickerPicker && <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2">{STICKERS.map((sticker) => <button key={sticker} type="button" onClick={() => { setReplySticker(sticker); setReplyGifUrl(''); setShowStickerPicker(false) }} className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-slate-100">{sticker}</button>)}</div>}

            <div className="mt-4 flex gap-2">
            </div>
          </div>
        )}

        </div>

        {/* Replies */}
        <div className="mt-3 space-y-0 lg:sticky lg:top-3 lg:mt-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
          {replies.length > 0 ? (
            replies.map((reply) => (
              <div key={reply.id} className={`feed-card border-b border-slate-200 ${reply.is_best_answer ? 'bg-emerald-50' : 'bg-white'} p-4 sm:p-5`}>
                {reply.is_best_answer && (
                  <div className="mb-3 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    ✓ Best Answer
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Link
                      href={reply.user_id ? `/user/profile/${encodeURIComponent(reply.user_id)}` : '/user/profile'}
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700 hover:ring-2 hover:ring-sky-300"
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
                        href={reply.user_id ? `/user/profile/${encodeURIComponent(reply.user_id)}` : '/user/profile'}
                        className="block truncate text-sm font-semibold text-slate-900 hover:text-sky-700"
                      >
                        {reply.info_users?.full_name || reply.info_users?.email || 'Anonymous'}
                      </Link>
                      <div className="text-xs text-slate-500">{formatDate(reply.created_at)}</div>
                    </div>
                  </div>
                  {userId === reply.user_id && <div className="flex items-center gap-1"><button type="button" onClick={() => { setEditingReplyId(reply.id); setEditingReplyContent(reply.content || '') }} aria-label="Edit comment" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => deleteReply(reply.id)} aria-label="Delete comment" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>}
                </div>

                {editingReplyId === reply.id ? <div className="mt-3"><textarea value={editingReplyContent} onChange={(event) => setEditingReplyContent(event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 p-2 text-sm outline-none" /><div className="mt-2 flex gap-2"><button type="button" onClick={() => saveReplyEdit(reply.id)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Save</button><button type="button" onClick={() => setEditingReplyId(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button></div></div> : <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{reply.content}</p>}
                {reply.image_url && <img src={reply.image_url} alt="Comment attachment" className="mt-3 max-h-64 rounded-xl object-cover" />}
                {reply.video_url && <video src={reply.video_url} controls className="mt-3 max-h-64 rounded-xl" />}
                {reply.gif_url && <img src={reply.gif_url} alt="GIF" className="mt-3 max-h-48 rounded-xl" />}
                {reply.sticker_url && <span className="mt-2 block text-3xl">{reply.sticker_url}</span>}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <Reactions contentType="forum_reply" contentId={reply.id} userId={userId} compact label="" />

                  <button type="button" onClick={() => setReportTarget(reply)} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100">
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
