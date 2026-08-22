'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CornerDownRight, MessageSquare, Pin, SortDesc } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

export default function Comments({ contentType, contentId, userId, onPinChange, sortBy = 'relevant' }) {
  const [comments, setComments] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sortMode, setSortMode] = useState(sortBy)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [showStickerPicker, setShowStickerPicker] = useState(false)
  const [selectedGif, setSelectedGif] = useState(null)
  const [selectedSticker, setSelectedSticker] = useState(null)

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
    loadComments()
  }, [loadComments, sortMode])

  const buildThreads = useCallback(() => {
    const map = new Map()
    comments.forEach((c) => map.set(c.id, { ...c, children: [] }))
    const roots = []
    map.forEach((node) => {
      if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id).children.push(node)
      } else {
        roots.push(node)
      }
    })

    const sortNodes = (nodes) => {
      return [...nodes].sort((a, b) => {
        if (sortMode === 'newest') return new Date(b.created_at) - new Date(a.created_at)
        if (sortMode === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
        if (sortMode === 'most_liked') return (b.relevance_score || 0) - (a.relevance_score || 0)
        // 'relevant' - pinned first, then by relevance score + replies
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return (b.relevance_score || 0) - (a.relevance_score || 0)
      })
    }

    roots.forEach((node) => {
      node.children = sortNodes(node.children)
    })

    return sortNodes(roots)
  }, [comments, sortMode])

  const threads = buildThreads()

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

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-4 border-l-2 border-slate-100 pl-3 sm:ml-6 sm:pl-4' : ''}`}>
        <div className={`rounded-[16px] border p-3 ${comment.is_pinned ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50'}`}>
          {comment.is_pinned && (
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              <Pin className="h-3 w-3" /> Pinned
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white">
              {comment.info_users?.profile_image_url ? (
                <img src={comment.info_users.profile_image_url} alt={authorName} className="h-full w-full object-cover" />
              ) : (
                getInitials(authorName)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-slate-900">{authorName}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatRelativeTime(comment.created_at)}</span>
                </div>
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
              </div>

              {comment.gif_url && <img src={comment.gif_url} alt="GIF" className="mt-2 max-h-40 rounded-xl object-cover" />}
              {comment.sticker_url && <span className="mt-1 block text-3xl">{comment.sticker_url}</span>}
              <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{comment.body}</p>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Reactions contentType="comment" contentId={comment.id} userId={userId} compact />
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
                >
                  <CornerDownRight className="h-3 w-3" /> Reply
                </button>
              </div>
            </div>
          </div>
        </div>

        {replyTo === comment.id && (
          <div className="mt-2 ml-4 sm:ml-8">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Reply to ${authorName}...`}
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={submitting || !body.trim()}
                className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? 'Posting...' : 'Reply'}
              </button>
              <button type="button" onClick={() => setReplyTo(null)} className="text-xs text-slate-500 hover:underline">Cancel</button>
            </div>
          </div>
        )}

        {comment.children?.length > 0 && (
          <div className="mt-3">
            {comment.children.map((child) => renderComment(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-[20px] border border-slate-200 bg-white p-4 sm:p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <MessageSquare className="h-4 w-4 text-sky-600" />
          Comments ({comments.length})
        </h3>

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

      {/* Comment input */}
      <div className="mb-4 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment... (Use @ to mention, # for hashtags)"
          rows={2}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setShowGifPicker(!showGifPicker); setShowStickerPicker(false) }}
              className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
            >
              GIF
            </button>
            <button
              type="button"
              onClick={() => { setShowStickerPicker(!showStickerPicker); setShowGifPicker(false) }}
              className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-200"
            >
              Sticker
            </button>
            {selectedGif && <span className="text-[10px] text-emerald-600 font-semibold">✓ GIF</span>}
            {selectedSticker && <span className="text-[10px] text-emerald-600 font-semibold">✓ Sticker</span>}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
            className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>

        {showGifPicker && (
          <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-2">
            {GIFS.map((gif) => (
              <button
                key={gif}
                type="button"
                onClick={() => { setSelectedGif(`https://api.dicebear.com/7.x/emoji/svg?seed=${encodeURIComponent(gif)}`); setShowGifPicker(false) }}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-slate-100"
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
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-slate-100"
              >
                {sticker}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comment list */}
      {threads.length > 0 ? (
        <div className="space-y-3">
          {threads.map((comment) => renderComment(comment))}
        </div>
      ) : (
        <div className="rounded-[16px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <MessageSquare className="mx-auto mb-2 h-7 w-7 text-slate-400" />
          <p className="text-sm text-slate-500">No comments yet. Be the first to share your thoughts!</p>
        </div>
      )}
    </div>
  )
}