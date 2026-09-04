'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, Laugh, Meh, Smile, ThumbsUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'

const REACTION_TYPES = [
  { type: 'like', label: 'Like', icon: ThumbsUp, color: 'text-sky-600', bg: 'bg-sky-50', emoji: '👍' },
  { type: 'love', label: 'Love', icon: Heart, color: 'text-rose-600', bg: 'bg-rose-50', emoji: '❤️' },
  { type: 'laugh', label: 'Laugh', icon: Laugh, color: 'text-amber-600', bg: 'bg-amber-50', emoji: '😂' },
  { type: 'wow', label: 'Wow', icon: Meh, color: 'text-violet-600', bg: 'bg-violet-50', emoji: '😮' },
  { type: 'sad', label: 'Sad', icon: Smile, color: 'text-blue-600', bg: 'bg-blue-50', emoji: '😢' },
  { type: 'angry', label: 'Angry', icon: ThumbsUp, color: 'text-red-600', bg: 'bg-red-50', emoji: '😡' },
]

const REACTION_ICON_MAP = {
  like: ThumbsUp,
  love: Heart,
  laugh: Laugh,
  wow: Meh,
  sad: Smile,
  angry: ThumbsUp,
}

export default function Reactions({ contentType, contentId, userId, onReact, compact = false, label, contentTitle = '' }) {
  const [reactionCounts, setReactionCounts] = useState({})
  const [userReaction, setUserReaction] = useState(null)
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const pickerRef = useRef(null)

  const loadReactions = useCallback(async () => {
    if (!contentId) return
    try {
      const [allResult, userResult] = await Promise.all([
        supabase
          .from('content_reactions')
          .select('reaction_type')
          .eq('content_type', contentType)
          .eq('content_id', contentId),
        userId
          ? supabase
              .from('content_reactions')
              .select('reaction_type')
              .eq('content_type', contentType)
              .eq('content_id', contentId)
              .eq('user_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const counts = {}
      ;(allResult.data || []).forEach((row) => {
        counts[row.reaction_type] = (counts[row.reaction_type] || 0) + 1
      })
      setReactionCounts(counts)
      setUserReaction(userResult.data?.reaction_type || null)
    } catch (err) {
      console.error('Failed to load reactions:', err)
    }
  }, [contentType, contentId, userId])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReactions()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadReactions])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalCount = Object.values(reactionCounts).reduce((sum, n) => sum + n, 0)

  // Determine the most used reaction (displayed as primary)
  const primaryReaction = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const PrimaryIcon = primaryReaction ? REACTION_ICON_MAP[primaryReaction] : ThumbsUp

  const handleReact = async (reactionType) => {
    if (!userId) {
      alert('Please log in to react to this content.')
      return
    }

    setLoading(true)
    try {
      if (userReaction === reactionType) {
        // Remove reaction
        const { error } = await supabase
          .from('content_reactions')
          .delete()
          .eq('user_id', userId)
          .eq('content_type', contentType)
          .eq('content_id', contentId)
        if (error) throw error
        setUserReaction(null)
        setReactionCounts((prev) => {
          const next = { ...prev }
          next[reactionType] = Math.max(0, (next[reactionType] || 0) - 1)
          return next
        })
      } else {
        const previous = userReaction
        // Upsert new reaction
        const { error } = await supabase
          .from('content_reactions')
          .upsert(
            { user_id: userId, content_type: contentType, content_id: contentId, reaction_type: reactionType },
            { onConflict: 'user_id,content_type,content_id' }
          )
        if (error) throw error

        setUserReaction(reactionType)
        setReactionCounts((prev) => {
          const next = { ...prev }
          next[reactionType] = (next[reactionType] || 0) + 1
          if (previous) {
            next[previous] = Math.max(0, (next[previous] || 0) - 1)
          }
          return next
        })
      }

      if (onReact) onReact(reactionType, userReaction === reactionType ? null : reactionType)
      if (userId && userReaction !== reactionType) {
        trackUserActivity({
          userId,
          activityType: 'react_content',
          entityType: contentType,
          entityId: contentId,
          description: `Reacted to ${contentTitle || contentType}`,
          metadata: {
            contentTitle: contentTitle || contentType,
            recipientUserId: null,
          },
        })
      }
      setShowPicker(false)
    } catch (err) {
      console.error('Reaction error:', err)
      alert('Failed to react. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const activeReactionMeta = REACTION_TYPES.find((r) => r.type === userReaction)

  return (
    <div className="flex items-center gap-2">
      {/* Primary reaction button */}
      <div className="relative" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            activeReactionMeta
              ? `${activeReactionMeta.bg} ${activeReactionMeta.color}`
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {userReaction && activeReactionMeta ? (
            <>
              <span className="text-sm leading-none">{activeReactionMeta.emoji}</span>
              {!compact && <span className="capitalize">{activeReactionMeta.label}</span>}
            </>
          ) : (
            <>
              <ThumbsUp className="h-3.5 w-3.5" />
              {!compact && (label || 'React')}
            </>
          )}

          {compact && label ? (
            <span className="font-bold">{totalCount} {label}</span>
          ) : (
            totalCount > 0 && <span className="font-bold">{totalCount}</span>
          )}
        </button>

        {/* Reaction picker popover */}
        {showPicker && (
          <div className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1.5 shadow-xl">
            {REACTION_TYPES.map(({ type, label, emoji, hover }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleReact(type)}
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:bg-slate-50 hover:scale-110 ${userReaction === type ? 'bg-slate-100' : ''}`}
                title={label}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Compact count badges for each reaction type */}
      {!compact && Object.keys(reactionCounts).length > 0 && (
        <div className="flex items-center gap-1">
          {Object.entries(reactionCounts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([type, count]) => {
              const meta = REACTION_TYPES.find((r) => r.type === type)
              if (!meta) return null
              return (
                <span key={type} className="inline-flex items-center gap-0.5 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500" title={meta.label}>
                  <span>{meta.emoji}</span>
                  {count}
                </span>
              )
            })}
        </div>
      )}
    </div>
  )
}