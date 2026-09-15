'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Heart,
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  const [userLikes, setUserLikes] = useState(new Set())
  const [editingThread, setEditingThread] = useState(false)
  const [threadDraft, setThreadDraft] = useState({ title: '', content: '' })
  const [showPollForm, setShowPollForm] = useState(false)
  const [pollDraft, setPollDraft] = useState({ question: '', options: ['', ''] })
  const [replyMedia, setReplyMedia] = useState({ image_url: '', video_url: '' })
  const [replyGifUrl, setReplyGifUrl] = useState('')
  const [replySticker, setReplySticker] = useState('')
  const [showReplyTools, setShowReplyTools] = useState(false)
  const isThreadOwner = Boolean(userId && thread?.created_by === userId)
  const [replyMentionRefs, setReplyMentionRefs] = useState([])
  const [editingReplyId, setEditingReplyId] = useState(null)
  const [editingReplyContent, setEditingReplyContent] = useState('')
  const [poll, setPoll] = useState(null)

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

          // Increment view count
          await supabase
            .from('forum_threads')
            .update({ views: (threadData.views || 0) + 1 })
            .eq('id', threadId)

          // Load replies
          const { data: repliesData } = await supabase
            .from('forum_replies')
            .select(
              `
              *,
              info_users(full_name, email)
            `
            )
            .eq('thread_id', threadId)
            .order('is_best_answer', { ascending: false })
            .order('likes', { ascending: false })
            .order('created_at', { ascending: true })

          setReplies(repliesData || [])

          if (session?.user?.id && repliesData?.length) {
            const { data: reactionRows, error: reactionError } = await supabase
              .from('content_reactions')
              .select('content_id')
              .eq('user_id', session.user.id)
              .eq('content_type', 'forum_reply')
              .in('content_id', repliesData.map((reply) => reply.id))

            if (reactionError) throw reactionError
            setUserLikes(new Set((reactionRows || []).map((reaction) => reaction.content_id)))
          }

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

      const { data, error } = await supabase.from('forum_replies').insert({
        thread_id: threadId,
        user_id: userId,
        content: replyContent.trim(),
        image_url: replyMedia.image_url || null,
        video_url: replyMedia.video_url || null,
        gif_url: replyGifUrl || null,
        sticker_url: replySticker || null,
        mention_data: replyMentionRefs.filter((mention) => mention?.id && !String(mention.id).startsWith('mention-')).map((mention) => ({ mentioned_user_id: mention.id, display_name: mention.displayName })),
        status: 'active',
      })

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
        const { data: newReplies } = await supabase
          .from('forum_replies')
          .select(
            `
            *,
            info_users(full_name, email)
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
      alert('Please log in to like replies.')
      return
    }

    const wasLiked = userLikes.has(replyId)
    const result = wasLiked
      ? await supabase.from('content_reactions').delete().eq('user_id', userId).eq('content_type', 'forum_reply').eq('content_id', replyId)
      : await supabase.from('content_reactions').upsert({ user_id: userId, content_type: 'forum_reply', content_id: replyId, reaction_type: 'like' }, { onConflict: 'user_id,content_type,content_id' })

    if (result.error) {
      console.error('Reply like update failed:', result.error)
      alert(result.error.message || 'Unable to update like right now.')
      return
    }

    setUserLikes((current) => {
      const next = new Set(current)
      if (wasLiked) next.delete(replyId)
      else next.add(replyId)
      return next
    }).select('*').single()
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

  const createPoll = async () => {
    const options = pollDraft.options.map((option) => option.trim()).filter(Boolean)
    if (!pollDraft.question.trim() || options.length < 2) return alert('Add a question and at least two options.')
    const { data, error } = await supabase.from('content_polls').insert({
      content_type: 'forum_thread',
      content_id: threadId,
      created_by: userId,
      question: pollDraft.question.trim(),
      options,
    })
    if (error) return alert(error.message || 'Unable to add the poll.')
    setPoll(data)
    setPollDraft({ question: '', options: ['', ''] })
    setShowPollForm(false)
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
          <Link href="/user/forums" className="mt-3 text-xs font-semibold text-sky-600 hover:underline">
            Back to forums
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell min-h-screen text-slate-900">
      <div className="mx-auto w-full max-w-[1280px] px-0 pb-24 pt-0 sm:px-0 sm:pt-3 lg:px-6 lg:pb-10">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-3 sm:px-4">
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

          {isThreadOwner && showPollForm && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><input value={pollDraft.question} onChange={(event) => setPollDraft((current) => ({ ...current, question: event.target.value }))} placeholder="Poll question" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" /><div className="mt-2 space-y-2">{pollDraft.options.map((option, index) => <input key={index} value={option} onChange={(event) => setPollDraft((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`Option ${index + 1}`} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />)}</div><button type="button" onClick={createPoll} className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white">Create poll</button></div>}
          {poll && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-bold text-slate-900">{poll.question}</p><div className="mt-3 space-y-2">{(poll.options || []).map((option, index) => <button key={option} type="button" className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:border-sky-300"><span>{option}</span><span className="text-xs text-slate-400">{poll.total_votes || 0} votes</span></button>)}</div></div>}

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
              <button type="button" onClick={() => { const url = window.prompt('Paste a GIF URL'); if (url?.trim()) setReplyGifUrl(url.trim()) }} aria-label="Add GIF" title="Add GIF" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-sky-700 ${replyGifUrl ? 'bg-white text-sky-700' : ''}`}><Gift className="h-4 w-4" /></button>
              <button type="button" onClick={() => { const sticker = window.prompt('Add a sticker or emoji'); if (sticker?.trim()) setReplySticker(sticker.trim()) }} aria-label="Add sticker" title="Add sticker" className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-sky-700 ${replySticker ? 'bg-white text-sky-700' : ''}`}><Smile className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1"><MentionsAutoSuggest value={replyContent} onChange={setReplyContent} placeholder="Share your thoughts, links, or mention someone..." rows={1} userId={userId} onMentionAdded={(mention) => setReplyMentionRefs((current) => [...current.filter((item) => item.id !== mention.id), { id: mention.id, displayName: mention.mentionToken || mention.full_name }])} /></div>
              <button type="button" onClick={handleReplySubmit} disabled={submittingReply || (!replyContent.trim() && !replyMedia.image_url && !replyMedia.video_url && !replyGifUrl && !replySticker)} aria-label="Post reply" title="Post reply" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"><Send className="h-4 w-4" /></button>
            </div>
            {showReplyTools && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2"><MediaUpload bucket="post-media" folder={`forum-replies/${threadId}`} mediaType="image" buttonText="Add photo" maxSizeMB={10} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, image_url: url || '' }))} /><MediaUpload bucket="post-media" folder={`forum-replies/${threadId}`} mediaType="video" buttonText="Add video" maxSizeMB={20} maxVideoDuration={30} onUploadComplete={(url) => setReplyMedia((current) => ({ ...current, video_url: url || '' }))} /></div>}

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
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{reply.info_users?.full_name || reply.info_users?.email || 'Anonymous'}</div>
                    <div className="text-xs text-slate-500">{formatDate(reply.created_at)}</div>
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
      </div>
    </main>
  )
}
