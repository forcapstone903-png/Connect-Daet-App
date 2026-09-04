'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CornerDownRight, Heart, MessageSquare, MoreHorizontal, Pin, SendHorizontal, SortDesc } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'
import { buildCommentThreads } from '@/lib/commentThreads'
import Reactions from './Reactions'

const GIFS = ['🎉', '👍', '👏', '🔥', '💯', '😍', '🤣', '🙌']
const STICKERS = ['😀', '😂', '😍', '😎', '🤔', '😢', '😡', '🥳', '🤝', '❤️']

function formatRelativeTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name = '') {
  return (name || 'U').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'U'
}

function countNestedReplies(comment) {
  if (!comment || !Array.isArray(comment.children)) return 0
  return comment.children.reduce((total, child) => total + 1 + countNestedReplies(child), 0)
}

function countCommentLikes(comment) {
  return Number(comment?.relevance_score || 0)
}

const INITIAL_VISIBLE_COMMENTS = 3

export default function Comments({ contentType, contentId, userId, contentTitle, onPinChange, sortBy = 'relevant' }) {
  const [comments, setComments] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sortMode, setSortMode] = useState(sortBy)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [selectedGif, setSelectedGif] = useState(null)
  const [selectedSticker, setSelectedSticker] = useState(null)
  const [showAllComments, setShowAllComments] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editedCommentText, setEditedCommentText] = useState('')
  const [expandedReplyIds, setExpandedReplyIds] = useState({})

  const loadComments = useCallback(async () => {
    if (!contentId) return
    try {
      const { data, error } = await supabase
        .from('content_comments')
        .select('*, info_users!content_comments_user_id_fkey(full_name, email, profile_image_url)')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: true })

      if (error) throw error
      setComments(data || [])
    } catch (err) {
      console.error('Failed to load comments:', err)
    }
  }, [contentType, contentId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadComments()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadComments, sortMode])

  useEffect(() => {
    const loadCurrentUser = async () => {
      if (!userId) {
        setCurrentUser(null)
        return
      }

      const { data } = await supabase
        .from('info_users')
        .select('full_name, profile_image_url')
        .eq('id', userId)
        .maybeSingle()

      setCurrentUser(data || null)
    }

    const timer = window.setTimeout(() => {
      void loadCurrentUser()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [userId])

  const threads = useMemo(() => buildCommentThreads(comments, sortMode), [comments, sortMode])
  const totalCommentCount = comments.length
  const totalReplyCount = comments.filter((comment) => comment.parent_id).length
  const totalLikeCount = comments.reduce((sum, comment) => sum + countCommentLikes(comment), 0)
  const visibleThreads = showAllComments ? threads : threads.slice(0, INITIAL_VISIBLE_COMMENTS)

  const handleEditComment = async (commentId) => {
    const trimmed = editedCommentText.trim()
    if (!trimmed || !commentId) return

    try {
      const { error } = await supabase
        .from('content_comments')
        .update({ body: trimmed })
        .eq('id', commentId)
        .eq('user_id', userId)

      if (error) throw error
      setEditingCommentId(null)
      setEditedCommentText('')
      setOpenMenuId(null)
      await loadComments()
    } catch (err) {
      console.error('Failed to update comment:', err)
      alert('Unable to update your comment. Please try again.')
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!commentId || !userId) return

    const confirmed = window.confirm('Are you sure you want to permanently delete this comment?')
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('content_comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId)

      if (error) throw error
      setOpenMenuId(null)
      await loadComments()
    } catch (err) {
      console.error('Failed to delete comment:', err)
      alert('Unable to delete the comment. Please try again.')
    }
  }

  const handleSubmit = async () => {
    if (!body.trim() || !userId) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('content_comments').insert({
        content_type: contentType,
        content_id: contentId,
        user_id: userId,
        parent_id: replyTo || null,
        body: body.trim(),
        gif_url: selectedGif || null,
        sticker_url: selectedSticker || null,
        relevance_score: 0,
        status: 'active',
      })
      if (error) throw error
      setBody('')
      setReplyTo(null)
      setSelectedGif(null)
      setSelectedSticker(null)
      setShowGifPicker(false)
      setShowStickerPicker(false)
      // Record the activity + notify admins (fire-and-forget).
      const contentOwner = contentType === 'blog' ? null : null
      trackUserActivity({
        userId,
        activityType: 'comment',
        entityType: contentType,
        entityId: contentId,
        description: `Commented on ${contentTitle || contentType}`,
        metadata: {
          contentTitle: contentTitle || '',
          body: body.trim(),
          recipientUserId: contentOwner,
        },
      })
      await loadComments()
    } catch (err) {
      console.error('Failed to post comment:', err)
      alert('Failed to post comment. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePin = async (commentId, shouldPin) => {
    const { error } = await supabase
      .from('content_comments')
      .update({ is_pinned: shouldPin })
      .eq('id', commentId)
    if (error) {
      console.error('Failed to pin comment:', error)
      alert('Only the content owner can pin comments.')
      return
    }
    if (onPinChange) onPinChange(commentId, shouldPin)
    await loadComments()
  }

  const renderComment = (comment, depth = 0) => {
    const authorName = comment.info_users?.full_name || comment.info_users?.email?.split('@')[0] || 'Community member'
    const isOwner = userId === comment.user_id
    const replyCount = countNestedReplies(comment)
    const likeCount = countCommentLikes(comment)
    const isMenuOpen = openMenuId === comment.id
    const isEditing = editingCommentId === comment.id
    const isReplyExpanded = Boolean(expandedReplyIds[comment.id])

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-4 border-l-2 border-slate-100 pl-3 sm:ml-6 sm:pl-4' : ''}`}>
        <div className={`rounded-[18px] border p-3 shadow-sm transition-all duration-200 hover:shadow-md ${comment.is_pinned ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50/80'}`}>
          {comment.is_pinned && (
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              <Pin className="h-3 w-3" /> Pinned
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white shadow-sm">
              {comment.info_users?.profile_image_url ? (
                <img src={comment.info_users.profile_image_url} alt={authorName} className="h-full w-full object-cover" />
              ) : (
                getInitials(authorName)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-bold text-slate-900">{authorName}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatRelativeTime(comment.created_at)}</span>
                </div>

                <div className="relative flex items-center gap-2">
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handlePin(comment.id, !comment.is_pinned)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                        comment.is_pinned ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {comment.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                  )}

                  {isOwner && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(isMenuOpen ? null : comment.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                        aria-label="Comment options"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 z-10 mt-2 w-32 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(comment.id)
                              setEditedCommentText(comment.body || '')
                              setOpenMenuId(null)
                            }}
                            className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuId(null)
                              handleDeleteComment(comment.id)
                            }}
                            className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {comment.gif_url && <img src={comment.gif_url} alt="GIF" className="mt-2 max-h-40 rounded-xl object-cover" />}
              {comment.sticker_url && <span className="mt-1 block text-3xl">{comment.sticker_url}</span>}

              {isEditing ? (
                <div className="mt-2">
                  <textarea
                    value={editedCommentText}
                    onChange={(e) => setEditedCommentText(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCommentId(null)
                        setEditedCommentText('')
                      }}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditComment(comment.id)}
                      disabled={!editedCommentText.trim()}
                      className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{comment.body}</p>
              )}

              {!isEditing && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
                  >
                    <Heart className="h-3.5 w-3.5" />
                    {likeCount > 0 ? `${likeCount} like${likeCount === 1 ? '' : 's'}` : 'Like'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (replyCount > 0) {
                        setExpandedReplyIds((prev) => ({
                          ...prev,
                          [comment.id]: !prev[comment.id],
                        }))
                        return
                      }

                      setReplyTo(replyTo === comment.id ? null : comment.id)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
                  >
                    <CornerDownRight className="h-3.5 w-3.5" />
                    {replyCount > 0 ? (isReplyExpanded ? 'Hide replies' : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`) : 'Reply'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {replyTo === comment.id && (
          <div className="mt-2 ml-4 sm:ml-8">
            <div className="rounded-[14px] border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-[9px] font-bold text-white">
                  {currentUser?.profile_image_url ? (
                    <img src={currentUser.profile_image_url} alt={currentUser.full_name || 'User'} className="h-full w-full object-cover" />
                  ) : (
                    getInitials(currentUser?.full_name || 'You')
                  )}
                </div>
                <div className="flex-1">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={`Reply to ${authorName}...`}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setReplyTo(null)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">Cancel</button>
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={submitting || !body.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                >
                  <SendHorizontal className="h-3.5 w-3.5" />
                  {submitting ? 'Posting...' : 'Reply'}
                </button>
              </div>
            </div>
          </div>
        )}

        {comment.children?.length > 0 && isReplyExpanded && (
          <div className="mt-3">
            {comment.children.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MessageSquare className="h-4 w-4 text-sky-600" />
            Comments
          </h3>
          <p className="mt-1 text-xs text-slate-500">{totalCommentCount} comments · {totalLikeCount} likes · {totalReplyCount} replies</p>
        </div>

        <div className="flex items-center gap-1">
          <SortDesc className="h-3.5 w-3.5 text-slate-400" />
          {['relevant', 'newest', 'oldest', 'most_liked'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize transition ${
                sortMode === mode ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mode.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-[18px] border border-slate-200 bg-slate-50 p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white shadow-sm">
            {currentUser?.profile_image_url ? (
              <img src={currentUser.profile_image_url} alt={currentUser.full_name || 'You'} className="h-full w-full object-cover" />
            ) : (
              getInitials(currentUser?.full_name || 'You')
            )}
          </div>

          <div className="flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write a comment…"
              rows={2}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setShowGifPicker(!showGifPicker); setShowStickerPicker(false) }}
                  className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
                >
                  GIF
                </button>
                <button
                  type="button"
                  onClick={() => { setShowStickerPicker(!showStickerPicker); setShowGifPicker(false) }}
                  className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
                >
                  Sticker
                </button>
                {selectedGif && <span className="text-[10px] font-semibold text-emerald-600">✓ GIF</span>}
                {selectedSticker && <span className="text-[10px] font-semibold text-emerald-600">✓ Sticker</span>}
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !body.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendHorizontal className="h-3.5 w-3.5" />
                {submitting ? 'Posting...' : 'Comment'}
              </button>
            </div>

            {showGifPicker && (
              <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2">
                {GIFS.map((gif) => (
                  <button
                    key={gif}
                    type="button"
                    onClick={() => { setSelectedGif(`https://api.dicebear.com/7.x/emoji/svg?seed=${encodeURIComponent(gif)}`); setShowGifPicker(false) }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-xl transition hover:bg-slate-100"
                  >
                    {gif}
                  </button>
                ))}
              </div>
            )}

            {showStickerPicker && (
              <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2">
                {STICKERS.map((sticker) => (
                  <button
                    key={sticker}
                    type="button"
                    onClick={() => { setSelectedSticker(sticker); setShowStickerPicker(false) }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-xl transition hover:bg-slate-100"
                  >
                    {sticker}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {threads.length > 0 ? (
        <div className={`overflow-hidden transition-all duration-300 ease-out ${showAllComments ? 'max-h-[2200px] opacity-100' : 'max-h-[620px] opacity-100'}`}>
          <div className="space-y-3">
            {visibleThreads.map((comment) => renderComment(comment))}
          </div>
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <MessageSquare className="mx-auto mb-2 h-7 w-7 text-slate-400" />
          <p className="text-sm text-slate-500">No comments yet. Be the first to share your thoughts!</p>
        </div>
      )}

      {threads.length > INITIAL_VISIBLE_COMMENTS && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAllComments((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 active:scale-[0.99]"
          >
            {showAllComments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAllComments ? 'Hide Comments' : 'See More Comments'}
          </button>
        </div>
      )}
    </div>
  )
}