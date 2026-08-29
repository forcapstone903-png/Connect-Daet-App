'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock,
  Eye,
  Flag,
  Heart,
  Mail,
  MessageSquare,
  Pencil,
  Pin,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import CommentText from '@/app/components/CommentText'
import { getAuthCookieFromDocument } from '@/lib/authCookies'

const STORAGE_KEYS = {
  readHistory: 'daet_blog_read_history',
  pinnedBlogs: 'daet_blog_pinned_blogs',
  localReplies: 'daet_blog_local_replies',
  offlineReads: 'daet_blog_offline_reads',
  shareCounts: 'daet_blog_share_counts',
}

const REPLY_COLLAPSE_LIMIT = 2

function readLocalStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    return fallback
  }
}

function writeLocalStorage(key, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    // ignore local storage failures quietly
  }
}

function calculateReadTime(content) {
  if (!content) return 1
  const wordCount = content.trim().split(/\s+/).length
  const readTime = Math.ceil(wordCount / 200)
  return Math.max(1, readTime)
}

function formatDate(value) {
  if (!value) return 'Recently'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))

  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

const categories = {
  travel_guides: 'Travel Guides',
  cultural_insights: 'Cultural Insights',
  food: 'Food',
  history: 'History',
  events: 'Events',
  announcement: 'Announcements',
}

export default function BlogDetailPage() {
  const params = useParams()
  const blogId = params?.id
  const [blog, setBlog] = useState(null)
  const [comments, setComments] = useState([])
  const [relatedBlogs, setRelatedBlogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState('Guest')
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [replyMap, setReplyMap] = useState({})
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [userReputation, setUserReputation] = useState(0)
  const [userBadges, setUserBadges] = useState([])
  const [shareCount, setShareCount] = useState(0)
  const [moderationPending, setModerationPending] = useState(0)
  const [showAllComments, setShowAllComments] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [expandedReplies, setExpandedReplies] = useState({})

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        const cookieSession = getAuthCookieFromDocument()
        // Fall back to the custom auth cookie so this page still knows who the
        // logged-in user is even if the Supabase session wasn't restored.
        const activeUserId = session?.user?.id || cookieSession?.user_id || cookieSession?.id || null
        if (session) {
          const fullName = session.user?.user_metadata?.full_name || session.user?.email || 'Guest'
          setUserName(fullName.split(' ')[0] || fullName)
        } else if (cookieSession?.user_name) {
          setUserName(String(cookieSession.user_name).split(' ')[0] || 'Guest')
        }
        setUserId(activeUserId)

        if (session) {
          const { data: userData } = await supabase
            .from('info_users')
            .select('reputation')
            .eq('id', session.user.id)
            .single()

          setUserReputation(userData?.reputation || 0)

          const { data: badgeData } = await supabase
            .from('user_badges')
            .select('badge_name')
            .eq('user_id', session.user.id)
            .limit(3)

          setUserBadges((badgeData || []).map((item) => item.badge_name))
        }

        if (!blogId) return

        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}

        const { data: blogData, error: blogError } = await supabase
          .from('info_blogs')
          .select('*, info_users(full_name, email)')
          .eq('id', blogId)
          .single()

        if (blogError) {
          console.error('Error loading blog:', blogError)
        } else if (blogData && !ignore) {
          setBlog(blogData)
          setShareCount(readLocalStorage(`${STORAGE_KEYS.shareCounts}_${blogId}`, 0))
          setIsPinned((readLocalStorage(STORAGE_KEYS.pinnedBlogs, []) || []).includes(blogId))

          await supabase.from('info_blogs').update({ views: (blogData.views || 0) + 1 }).eq('id', blogId)

          const { data: commentsData } = await supabase
            .from('info_comments')
            .select('*, info_users(full_name, email)')
            .eq('blog_id', blogId)
            .order('created_at', { ascending: false })

          const mergedComments = (commentsData || []).map((comment) => ({
            ...comment,
            replies: blogLocalReplies[comment.id] || [],
          }))

          setComments(mergedComments)
          setModerationPending((commentsData || []).filter((item) => item.status !== 'approved').length)

          const { data: relatedData } = await supabase
            .from('info_blogs')
            .select('*, info_users(full_name, email)')
            .eq('status', 'published')
            .eq('category', blogData.category)
            .neq('id', blogId)
            .order('views', { ascending: false })
            .limit(3)

          setRelatedBlogs(relatedData || [])

          const history = readLocalStorage(STORAGE_KEYS.readHistory, []) || []
          const updatedHistory = [
            { id: blogId, title: blogData.title, time: formatDate(new Date()) },
            ...history.filter((entry) => entry.id !== blogId),
          ].slice(0, 5)
          writeLocalStorage(STORAGE_KEYS.readHistory, updatedHistory)

          if (session?.user?.id) {
            const { data: saveData } = await supabase
              .from('user_favorites')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('item_type', 'blog')
              .eq('item_id', blogId)
              .single()

            setIsSaved(!!saveData)
          }
        }

        if (!ignore) setLoading(false)
      } catch (error) {
        console.error('Blog fetch failed:', error)
        if (!ignore) setLoading(false)
      }
    }

    loadData()

    return () => {
      ignore = true
    }
  }, [blogId])

  const handleLike = async () => {
    if (!userId) {
      alert('Please log in to like articles')
      return
    }

    try {
      const nextLikeCount = isLiked ? (blog.likes || 1) - 1 : (blog.likes || 0) + 1
      await supabase.from('info_blogs').update({ likes: nextLikeCount }).eq('id', blogId)
      setIsLiked(!isLiked)
      setBlog((prev) => ({ ...prev, likes: nextLikeCount }))
    } catch (error) {
      console.error('Error liking blog:', error)
    }
  }

  const handleSave = async () => {
    if (!userId) {
      alert('Please log in to save articles')
      return
    }

    try {
      if (isSaved) {
        await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('item_type', 'blog')
          .eq('item_id', blogId)

        const offlineReads = readLocalStorage(STORAGE_KEYS.offlineReads, [])
        writeLocalStorage(
          STORAGE_KEYS.offlineReads,
          offlineReads.filter((item) => item !== blogId)
        )
      } else {
        await supabase.from('user_favorites').insert({
          user_id: userId,
          item_type: 'blog',
          item_id: blogId,
        })

        const offlineReads = readLocalStorage(STORAGE_KEYS.offlineReads, [])
        writeLocalStorage(STORAGE_KEYS.offlineReads, [...new Set([...offlineReads, blogId])])
      }

      setIsSaved(!isSaved)
    } catch (error) {
      console.error('Error saving blog:', error)
    }
  }

  const togglePin = () => {
    const pinnedBlogs = readLocalStorage(STORAGE_KEYS.pinnedBlogs, [])
    const updated = isPinned ? pinnedBlogs.filter((id) => id !== blogId) : [...new Set([...pinnedBlogs, blogId])]
    writeLocalStorage(STORAGE_KEYS.pinnedBlogs, updated)
    setIsPinned(!isPinned)
  }

  const handleCommentSubmit = async (parentId = null) => {
    const content = parentId ? (replyMap[parentId] || '').trim() : commentContent.trim()
    if (!content) return

    setSubmittingComment(true)
    try {
      if (!userId) {
        alert('Please log in to comment')
        return
      }

      if (parentId) {
        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}
        const generatedReplyId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `reply-${Date.now()}`
        const nextReply = {
          id: generatedReplyId,
          parent_id: parentId,
          blog_id: blogId,
          user_id: userId,
          content,
          status: 'approved',
          created_at: new Date().toISOString(),
          likes: 0,
          local: true,
          info_users: { full_name: userName, email: userName },
        }

        const nextMap = {
          ...blogLocalReplies,
          [parentId]: [...(blogLocalReplies[parentId] || []), nextReply],
        }

        const nextLocalReplies = {
          ...localReplies,
          [blogId]: nextMap,
        }

        writeLocalStorage(STORAGE_KEYS.localReplies, nextLocalReplies)
        setComments((prev) =>
          prev.map((item) =>
            item.id === parentId
              ? { ...item, replies: [...(item.replies || []), nextReply] }
              : item
          )
        )
        setReplyMap((prev) => ({ ...prev, [parentId]: '' }))
      } else {
        const { data, error } = await supabase.from('info_comments').insert({
          blog_id: blogId,
          user_id: userId,
          content,
          status: 'pending',
        })

        if (error) throw error

        const generatedCommentId =
          data?.[0]?.id ||
          (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `comment-${Date.now()}`)

        const createdComment = {
          id: generatedCommentId,
          blog_id: blogId,
          user_id: userId,
          content,
          status: 'pending',
          created_at: new Date().toISOString(),
          likes: 0,
          replies: [],
          info_users: { full_name: userName, email: userName },
        }

        setComments((prev) => [createdComment, ...prev])
        setCommentContent('')
        setModerationPending((prev) => prev + 1)

        const nextCommentCount = (blog.comments_count || 0) + 1
        await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
        setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
      }
    } catch (error) {
      console.error('Error submitting comment:', error)
      alert('An error occurred. Please try again.')
    } finally {
      setSubmittingComment(false)
    }
  }

  const findComment = (id) => {
    for (const c of comments) {
      if (c.id === id) return { comment: c, parentId: null }
      const reply = (c.replies || []).find((r) => r.id === id)
      if (reply) return { comment: reply, parentId: c.id }
    }
    return { comment: null, parentId: null }
  }

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id)
    setEditBody(comment.content || '')
    setReplyMap((prev) => {
      const next = { ...prev }
      delete next[comment.id]
      return next
    })
  }

  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditBody('')
  }

  const handleEditComment = async (commentId) => {
    const nextContent = editBody.trim()
    if (!nextContent) return
    const { comment: target } = findComment(commentId)
    if (!target) return
    try {
      if (target.local) {
        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}
        const updated = (blogLocalReplies[target.parent_id] || []).map((r) =>
          r.id === commentId ? { ...r, content: nextContent } : r
        )
        writeLocalStorage(STORAGE_KEYS.localReplies, {
          ...localReplies,
          [blogId]: { ...blogLocalReplies, [target.parent_id]: updated },
        })
      } else {
        const { error } = await supabase.from('info_comments').update({ content: nextContent }).eq('id', commentId)
        if (error) throw error
      }

      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) return { ...c, content: nextContent }
          return { ...c, replies: (c.replies || []).map((r) => (r.id === commentId ? { ...r, content: nextContent } : r)) }
        })
      )
      setEditingCommentId(null)
      setEditBody('')
    } catch (error) {
      console.error('Error editing comment:', error)
      alert('Failed to edit comment. Please try again.')
    }
  }

  const handleDeleteComment = async (commentId) => {
    const { comment: target, parentId } = findComment(commentId)
    if (!target) return
    if (!window.confirm('Delete this comment permanently?')) return
    try {
      if (target.local) {
        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}
        const updated = (blogLocalReplies[parentId] || []).filter((r) => r.id !== commentId)
        writeLocalStorage(STORAGE_KEYS.localReplies, {
          ...localReplies,
          [blogId]: { ...blogLocalReplies, [parentId]: updated },
        })
      } else {
        const { error } = await supabase.from('info_comments').delete().eq('id', commentId)
        if (error) throw error
        if (!parentId) {
          const nextCount = Math.max(0, (blog.comments_count || 0) - 1)
          await supabase.from('info_blogs').update({ comments_count: nextCount }).eq('id', blogId)
          setBlog((prev) => ({ ...prev, comments_count: nextCount }))
        }
      }

      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => ({ ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }))
      )
      if (editingCommentId === commentId) {
        setEditingCommentId(null)
        setEditBody('')
      }
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment. Please try again.')
    }
  }

  const handleShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = blog?.title || 'Check out this article'
    const nextCount = (shareCount || 0) + 1

    if (platform === 'copy') {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
      alert('Link copied to clipboard!')
    } else if (platform === 'email') {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`
    } else {
      const shareUrls = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      }

      if (shareUrls[platform]) {
        window.open(shareUrls[platform], '_blank')
      }
    }

    if (platform !== 'copy' && platform !== 'email') {
      setShareCount(nextCount)
      writeLocalStorage(`${STORAGE_KEYS.shareCounts}_${blogId}`, nextCount)
    }

    setShowShareMenu(false)
  }

  const renderComment = (comment, isReply = false) => {
    const isOwner = userId && comment.user_id === userId
    const isEditing = editingCommentId === comment.id

    return (
    <div
      key={comment.id}
      className={`rounded-[20px] border p-4 ${
        isReply ? 'ml-6 border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900">
            {comment.info_users?.full_name || comment.info_users?.email || 'Anonymous'}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{formatDate(comment.created_at)}</span>
            {comment.status && comment.status !== 'approved' && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 border border-amber-200">
                {comment.status}
              </span>
            )}
            {comment.local && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 border border-sky-200">
                local reply
              </span>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <div className="mt-2">
          <textarea
            value={editBody}
            onChange={(event) => setEditBody(event.target.value)}
            rows={3}
            autoFocus
            className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleEditComment(comment.id)}
              disabled={!editBody.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Save
            </button>
            <button
              type="button"
              onClick={cancelEditComment}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <CommentText text={comment.content} className="mt-2" />
      )}

      <div className="mt-3 flex items-center gap-3 text-xs">
        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100">
          <Heart className="h-3.5 w-3.5" />
          <span className="font-semibold">{comment.likes || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setReplyMap((prev) => ({ ...prev, [comment.id]: prev[comment.id] || '' }))
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100"
        >
          Reply
        </button>

        {isOwner && (
          <>
            <button
              type="button"
              onClick={() => startEditComment(comment)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => handleDeleteComment(comment.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </>
        )}

        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100">
          <Flag className="h-3.5 w-3.5" />
          Report
        </button>
      </div>

      {replyMap[comment.id] !== undefined && (
        <div className="mt-3 space-y-2">
          <textarea
            value={replyMap[comment.id] || ''}
            onChange={(event) =>
              setReplyMap((prev) => ({ ...prev, [comment.id]: event.target.value }))
            }
            rows={3}
            placeholder="Write a reply..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
          />
          <button
            type="button"
            onClick={() => handleCommentSubmit(comment.id)}
            disabled={submittingComment || !(replyMap[comment.id] || '').trim()}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Post Reply
          </button>
        </div>
      )}

      {(comment.replies || []).length > 0 && (
        <div className="mt-4 space-y-3">
          {(() => {
            const children = comment.replies || []
            const repliesExpanded = !!expandedReplies[comment.id]
            const totalReplies = children.length
            const isCollapsed = totalReplies > REPLY_COLLAPSE_LIMIT && !repliesExpanded
            const visibleChildren = isCollapsed ? children.slice(0, REPLY_COLLAPSE_LIMIT) : children
            return (
              <>
                {visibleChildren.map((reply) => renderComment(reply, true))}
                {isCollapsed && (
                  <button
                    type="button"
                    onClick={() => setExpandedReplies((prev) => ({ ...prev, [comment.id]: true }))}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-right text-xs font-semibold text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
                  >
                    View {totalReplies - REPLY_COLLAPSE_LIMIT} more {totalReplies - REPLY_COLLAPSE_LIMIT === 1 ? 'reply' : 'replies'}
                  </button>
                )}
                {repliesExpanded && (
                  <button
                    type="button"
                    onClick={() => setExpandedReplies((prev) => ({ ...prev, [comment.id]: false }))}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-right text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    Show fewer replies
                  </button>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-16 animate-pulse rounded-[20px] bg-slate-200" />
          <div className="mb-6 h-96 animate-pulse rounded-[20px] bg-slate-200" />
        </div>
      </main>
    )
  }

  if (!blog) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Article not found.</p>
          <Link href="/user/blogs" className="mt-3 text-xs font-semibold text-sky-600 hover:underline">
            Back to blogs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/user/blogs" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back to Articles
          </Link>

          <div className="flex items-center gap-2">
            <button type="button" onClick={togglePin} className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 transition ${isPinned ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-slate-200 bg-white hover:bg-slate-50'}`} title={isPinned ? 'Unpin article' : 'Pin article'}>
              <Pin className={`h-5 w-5 ${isPinned ? 'fill-current' : ''}`} />
            </button>

            <button type="button" onClick={handleLike} className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 transition ${isLiked ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-white hover:bg-slate-50'}`} title="Like article">
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
            </button>

            <button type="button" onClick={handleSave} className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-slate-600 transition ${isSaved ? 'border-sky-200 bg-sky-50 text-sky-600' : 'border-slate-200 bg-white hover:bg-slate-50'}`} title="Save article">
              <Bookmark className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
            </button>

            <div className="relative">
              <button type="button" onClick={() => setShowShareMenu(!showShareMenu)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Share article">
                <Share2 className="h-5 w-5" />
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-12 z-10 rounded-[16px] border border-slate-200 bg-white shadow-lg">
                  <button type="button" onClick={() => handleShare('twitter')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-[14px]">Share on Twitter</button>
                  <button type="button" onClick={() => handleShare('facebook')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on Facebook</button>
                  <button type="button" onClick={() => handleShare('linkedin')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on LinkedIn</button>
                  <button type="button" onClick={() => handleShare('email')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5" />Email</span></button>
                  <button type="button" onClick={() => handleShare('copy')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-[14px]">Copy Link</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <article className="mb-8 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-8">
          {blog.featured_image && (
            <div className="mb-6 overflow-hidden rounded-[16px]">
              <img alt={blog.title} src={blog.featured_image} className="h-96 w-full object-cover" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-bold uppercase text-sky-700">
              {categories[blog.category] || blog.category}
            </span>
            <span className="text-slate-500">•</span>
            <span className="inline-flex items-center gap-1 text-slate-600">
              <Clock className="h-3.5 w-3.5" />
              {calculateReadTime(blog.content)} min read
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-600">{formatDate(blog.published_at)}</span>
          </div>

          <h1 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">{blog.title}</h1>

          <div className="mt-6 flex items-center justify-between border-t border-b border-slate-200 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
                {(blog.info_users?.full_name || blog.info_users?.email || 'A')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{blog.info_users?.full_name || blog.info_users?.email || 'Anonymous'}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(blog.published_at)}</span>
                  <span>•</span>
                  <span>{shareCount} shares</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{(blog.views || 0) + 1}</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                <span>{blog.likes || 0}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 border border-sky-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Reputation {userReputation}
            </div>
            {userBadges.length > 0 && userBadges.map((badge) => (
              <span key={badge} className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 border border-amber-200">
                <Star className="h-3.5 w-3.5" />
                {badge}
              </span>
            ))}
          </div>

          <div className="mt-8 space-y-6 leading-relaxed text-slate-700">
            {blog.excerpt && <p className="text-lg italic text-slate-600">{blog.excerpt}</p>}

            {blog.content && (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: blog.content.replace(/\n/g, '<br />') }}
              />
            )}
          </div>

          {blog.tags && blog.tags.length > 0 && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</p>
              <div className="flex flex-wrap gap-2">
                {blog.tags.map((tag, idx) => (
                  <span key={idx} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">Comments ({comments.length})</h2>
            {moderationPending > 0 && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                {moderationPending} pending moderation
              </span>
            )}
          </div>

          <div className="mb-6 rounded-[20px] border border-slate-200 bg-white p-5">
            <h3 className="mb-4 text-sm font-bold text-slate-900">Share Your Thoughts</h3>
            <textarea
              value={commentContent}
              onChange={(event) => setCommentContent(event.target.value)}
              placeholder="Write a comment..."
              rows={4}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-1 focus:ring-sky-200"
            />
            <div className="mt-4">
              <button
                type="button"
                onClick={() => handleCommentSubmit()}
                disabled={submittingComment || !commentContent.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>

          {comments.length > 0 ? (
            <div className="space-y-4">
              {(showAllComments ? comments : comments.slice(0, 3)).map((comment) => renderComment(comment))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}

          {comments.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllComments((v) => !v)}
              className="mt-4 flex w-full items-center justify-center rounded-full border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
            >
              {showAllComments ? 'Show less' : `See more comments (${comments.length - 3})`}
            </button>
          )}
        </section>

        {relatedBlogs.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Related Articles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedBlogs.map((relatedBlog) => (
                <Link key={relatedBlog.id} href={`/user/blogs/${relatedBlog.id}`} className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:shadow-lg hover:border-sky-200">
                  <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600">
                    {relatedBlog.featured_image ? (
                      <img alt={relatedBlog.title} src={relatedBlog.featured_image} className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><span className="text-3xl opacity-50">📰</span></div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition" />
                  </div>

                  <div className="p-4">
                    <h3 className="text-base font-bold text-slate-900 line-clamp-2">{relatedBlog.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{relatedBlog.excerpt}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <Eye className="h-3.5 w-3.5" />
                      {relatedBlog.views || 0} views
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
