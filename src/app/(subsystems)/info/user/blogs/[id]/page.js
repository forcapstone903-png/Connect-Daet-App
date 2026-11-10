'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import {
  Bookmark,
  ChevronDown,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Flag,
  Clock,
  User,
  Eye,
  Send,
  Pencil,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { invalidateCachePrefix } from '@/lib/cache'
import Reactions from '@/app/(subsystems)/info/components/user/Reactions'
import MentionText from '@/app/(subsystems)/info/components/user/MentionText'
import MentionsAutoSuggest from '@/app/(subsystems)/info/components/user/MentionsAutoSuggest'
import SocialActionBar from '@/app/(subsystems)/info/components/user/SocialActionBar'
import PostMediaCarousel from '@/app/(subsystems)/info/components/user/PostMediaCarousel'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { getPostImages } from '@/lib/postMedia'

const STORAGE_KEYS = {
  readHistory: 'daet_blog_read_history',
  shareCounts: 'daet_blog_share_counts',
}

const INITIAL_COMMENTS = 3
const COMMENTS_PER_PAGE = 3
const INITIAL_REPLIES = 3
const REPLIES_PER_PAGE = 3

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

function getInitials(name = '') {
  return String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U'
}

const categories = {
  travel_guides: 'Travel Guides',
  cultural_insights: 'Cultural Insights',
  food: 'Food',
  history: 'History',
  events: 'Events',
  announcement: 'Announcements',
}

function getInterestCategoryValues(interests = []) {
  const values = new Set()
  interests.forEach((interest) => {
    const value = String(interest || '').trim().toLowerCase()
    if (/beach|nature|travel|outdoor/.test(value)) values.add('travel_guides')
    if (/culture|heritage|art/.test(value)) values.add('cultural_insights')
    if (/food|cuisine/.test(value)) values.add('food')
    if (/history/.test(value)) values.add('history')
    if (/event/.test(value)) values.add('events')
  })
  return [...values]
}

function canOptimizeImage(src) {
  if (!src) return false
  if (src.startsWith('/')) return true
  try {
    const imageUrl = new URL(src)
    const hostname = imageUrl.hostname
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : ''
    return hostname === 'images.unsplash.com'
      || (hostname === supabaseHostname && imageUrl.pathname.startsWith('/storage/v1/object/public/'))
  } catch {
    return false
  }
}

export default function BlogDetailPage() {
  const params = useParams()
  const router = useRouter()
  const blogId = params?.id
  const [blog, setBlog] = useState(null)
  const [comments, setComments] = useState([])
  const [commentLoadError, setCommentLoadError] = useState('')
  const [commentReloadKey, setCommentReloadKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState('Guest')
  const [userProfileImage, setUserProfileImage] = useState('')
  const [isSaved, setIsSaved] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [replyMap, setReplyMap] = useState({})
  const [replyMentionRefs, setReplyMentionRefs] = useState({})
  const [submittingComment, setSubmittingComment] = useState(false)
  const [userBadges, setUserBadges] = useState([])
  const [shareCount, setShareCount] = useState(0)
  const [authorBio, setAuthorBio] = useState('')
  const [authorBlogs, setAuthorBlogs] = useState([])
  const [relatedBlogs, setRelatedBlogs] = useState([])
  const [interestBlogs, setInterestBlogs] = useState([])
  const [popularBlogs, setPopularBlogs] = useState([])
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState('')
  const [editorialLoading, setEditorialLoading] = useState(false)
  const [editorialError, setEditorialError] = useState('')
  const [editorialReloadKey, setEditorialReloadKey] = useState(0)
  const [moderationPending, setModerationPending] = useState(0)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const [commentModifying, setCommentModifying] = useState(false)
  const [menuCommentId, setMenuCommentId] = useState(null)
  const [visibleComments, setVisibleComments] = useState(INITIAL_COMMENTS)
  const [visibleReplies, setVisibleReplies] = useState({})
  const [expandedReplies, setExpandedReplies] = useState({})
  const commentRefreshSequenceRef = useRef(0)
  const commentsSectionRef = useRef(null)

  // All photos attached to this article (images[] + featured_image), normalized
  // and filtered; the shared gallery/lightbox render the complete list.
  const detailGallery = useMemo(() => getPostImages(blog), [blog])
  const articleId = blog?.id || ''
  const articleAuthorId = blog?.created_by || blog?.info_users?.id || ''
  const articleCategory = blog?.category || ''

  useEffect(() => {
    let ignore = false

    const loadData = async () => {
      try {
        const sessionResult = await supabase.auth.getSession()
        const session = sessionResult?.data?.session
        const cookieSession = getAuthCookieFromDocument()
        const currentUserId = session?.user?.id || cookieSession?.user_id || null
        if (currentUserId) {
          const fullName = session?.user?.user_metadata?.full_name || cookieSession?.user_name || session?.user?.email || cookieSession?.user_email || 'Guest'
          setUserName(fullName)
          setUserId(currentUserId)

          const { data: currentProfile, error: profileError } = await supabase
            .from('info_users')
            .select('full_name, profile_image_url')
            .eq('id', currentUserId)
            .maybeSingle()
          if (profileError) {
            console.error('Unable to load current user profile for blog responses:', profileError)
          } else if (currentProfile && !ignore) {
            setUserName(currentProfile.full_name?.trim() || fullName)
            setUserProfileImage(currentProfile.profile_image_url || '')
          }

          const { data: badgeData } = await supabase
            .from('user_badges')
            .select('badge_name')
            .eq('user_id', currentUserId)
            .limit(3)

          setUserBadges((badgeData || []).map((item) => item.badge_name))
        }

        if (!blogId) return

        const { data: blogData, error: blogError } = await supabase
          .from('info_blogs')
          .select('*, info_users(id, full_name, email, profile_image_url)')
          .eq('id', blogId)
          .single()

        if (blogError) {
          console.error('Error loading blog:', blogError)
        } else if (blogData && !ignore) {
          setBlog(blogData)
          setShareCount(readLocalStorage(`${STORAGE_KEYS.shareCounts}_${blogId}`, 0))

          const { data: reactionRows, error: reactionError } = await supabase
            .from('content_reactions')
            .select('user_id, reaction_type')
            .eq('content_type', 'blog')
            .eq('content_id', blogId)
            .eq('reaction_type', 'like')
          if (reactionError) throw reactionError
          setBlog((previous) => ({ ...previous, likes: reactionRows?.length || 0 }))

          const viewKey = `daet_blog_viewed_${blogId}`
          if (!window.sessionStorage.getItem(viewKey)) {
            window.sessionStorage.setItem(viewKey, '1')
            await supabase.from('info_blogs').update({ views: (blogData.views || 0) + 1 }).eq('id', blogId)
          }

          const commentsResponse = await fetch(`/info/api/blog-comments?blogId=${encodeURIComponent(blogId)}`, { credentials: 'same-origin', cache: 'no-store' })
          const commentsPayload = await commentsResponse.json().catch(() => ({}))
          const commentsData = commentsResponse.ok && commentsPayload.success ? commentsPayload.comments || [] : null
          const commentsError = commentsData === null ? new Error(commentsPayload.message || 'Unable to load comments.') : null
          if (commentsError) console.error('Blog comments load failed:', commentsError.message)

          const repliesByParent = {}
          ;(commentsData || []).forEach((comment) => {
            if (comment.parent_id) repliesByParent[comment.parent_id] = [...(repliesByParent[comment.parent_id] || []), comment]
          })
          const buildCommentTree = (comment) => ({
            ...comment,
            replies: (repliesByParent[comment.id] || []).map(buildCommentTree),
          })
          const mergedComments = (commentsData || [])
            .filter((comment) => !comment.parent_id)
            .map(buildCommentTree)

          setComments((currentComments) => {
            if (commentsError || !Array.isArray(commentsData)) return currentComments
            const currentById = new Map(currentComments.map((comment) => [String(comment.id), comment]))
            const mergedIds = new Set(mergedComments.map((comment) => String(comment.id)))
            const preservedLocalComments = currentComments.filter((comment) => !mergedIds.has(String(comment.id)))
            return mergedComments.map((comment) => {
              const current = currentById.get(String(comment.id))
              if (!current) return comment
              return {
                ...comment,
                replies: current.replies?.length > comment.replies?.length ? current.replies : comment.replies,
              }
            }).concat(preservedLocalComments)
          })
          setVisibleComments(INITIAL_COMMENTS)
          setModerationPending((commentsData || []).filter((item) => item.status !== 'approved').length)

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

  useEffect(() => {
    if (!blogId) return undefined

    let active = true
    const refreshComments = async () => {
      const requestSequence = ++commentRefreshSequenceRef.current
      try {
        const response = await fetch(`/info/api/blog-comments?blogId=${encodeURIComponent(blogId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload.success) {
          throw new Error(payload.message || 'Unable to refresh comments.')
        }

        const commentRows = Array.isArray(payload.comments) ? payload.comments : []
        const commentsById = new Map(commentRows.map((comment) => [String(comment.id), { ...comment, replies: [] }]))
        const roots = []
        commentRows.forEach((comment) => {
          const current = commentsById.get(String(comment.id))
          const parent = comment.parent_id ? commentsById.get(String(comment.parent_id)) : null
          if (parent) parent.replies.push(current)
          else roots.push(current)
        })

        if (active && requestSequence === commentRefreshSequenceRef.current) {
          setComments(roots)
          setModerationPending(commentRows.filter((comment) => comment.status !== 'approved').length)
          setCommentLoadError('')
        }
      } catch (error) {
        if (!active || requestSequence !== commentRefreshSequenceRef.current) return
        console.error('Live article comment refresh failed:', error)
        setCommentLoadError('Comments may be out of date. Retry to refresh them.')
      }
    }

    void refreshComments()
    const channel = supabase
      .channel(`blog-comments-${blogId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'content_comments',
        filter: `content_id=eq.${blogId}`,
      }, () => {
        void refreshComments()
      })
      .subscribe((status) => {
        if (active && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
          console.error(`Blog comment realtime channel status: ${status}`)
          setCommentLoadError('Live comment updates are unavailable. Retry to refresh comments.')
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [blogId, commentReloadKey])

  useEffect(() => {
    if (!articleId || !articleAuthorId) return undefined

    let ignore = false

    const loadEditorialContext = async () => {
      setEditorialLoading(true)
      setEditorialError('')
      try {
        const [profileResult, followResult, authorResult, relatedResult, popularResult, preferenceResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('bio, is_public')
            .eq('user_id', articleAuthorId)
            .maybeSingle(),
          userId && userId !== articleAuthorId
            ? supabase
                .from('user_follows')
                .select('id')
                .eq('follower_id', userId)
                .eq('following_id', articleAuthorId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('info_blogs')
            .select('id, title, excerpt, featured_image, published_at, category')
            .eq('status', 'published')
            .eq('created_by', articleAuthorId)
            .neq('id', articleId)
            .order('published_at', { ascending: false })
            .limit(4),
          articleCategory
            ? supabase
                .from('info_blogs')
                .select('id, title, excerpt, featured_image, published_at, category')
                .eq('status', 'published')
                .eq('category', articleCategory)
                .neq('id', articleId)
                .neq('created_by', articleAuthorId)
                .order('published_at', { ascending: false })
                .limit(4)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('info_blogs')
            .select('id, title, excerpt, featured_image, published_at, category')
            .eq('status', 'published')
            .neq('id', articleId)
            .order('views', { ascending: false, nullsFirst: false })
            .limit(4),
          userId
            ? supabase
                .from('user_feed_preferences')
                .select('preferred_categories')
                .eq('user_id', userId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])

        const failedResult = [profileResult, followResult, authorResult, relatedResult, popularResult, preferenceResult]
          .find((result) => result.error)
        if (failedResult) throw failedResult.error
        if (ignore) return

        const interestCategories = getInterestCategoryValues(preferenceResult.data?.preferred_categories || [])
        const interestResult = interestCategories.length
          ? await supabase
              .from('info_blogs')
              .select('id, title, excerpt, featured_image, published_at, category')
              .eq('status', 'published')
              .in('category', interestCategories)
              .neq('id', articleId)
              .neq('created_by', articleAuthorId)
              .order('published_at', { ascending: false })
              .limit(8)
          : { data: [], error: null }
        if (interestResult.error) throw interestResult.error
        if (ignore) return

        const alreadyRecommended = new Set([
          articleId,
          ...(authorResult.data || []).map((item) => item.id),
          ...(relatedResult.data || []).map((item) => item.id),
        ].map(String))
        const uniqueInterestBlogs = (interestResult.data || []).filter((item) => !alreadyRecommended.has(String(item.id)))
        uniqueInterestBlogs.forEach((item) => alreadyRecommended.add(String(item.id)))

        setAuthorBio(
          profileResult.data?.is_public !== false || followResult.data
            ? profileResult.data?.bio || ''
            : '',
        )
        setIsFollowingAuthor(Boolean(followResult.data))
        setAuthorBlogs(authorResult.data || [])
        setRelatedBlogs(relatedResult.data || [])
        setInterestBlogs(uniqueInterestBlogs)
        setPopularBlogs((popularResult.data || []).filter((item) => !alreadyRecommended.has(String(item.id))))
      } catch (error) {
        console.error('Article recommendations failed:', error)
        if (!ignore) setEditorialError('Author details and recommendations could not be loaded.')
      } finally {
        if (!ignore) setEditorialLoading(false)
      }
    }

    void loadEditorialContext()
    return () => {
      ignore = true
    }
  }, [articleId, articleAuthorId, articleCategory, userId, editorialReloadKey])

  const handleToggleAuthorFollow = async () => {
    const authorId = blog?.created_by || blog?.info_users?.id
    if (!authorId || followBusy) return
    if (!userId) {
      router.push('/info/login?message=Please+sign+in+to+follow+this+author.')
      return
    }

    setFollowBusy(true)
    setFollowError('')
    try {
      const response = await fetch(`/info/api/users/${encodeURIComponent(authorId)}/follow`, {
        method: isFollowingAuthor ? 'DELETE' : 'POST',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to update your follow status.')
      }

      setIsFollowingAuthor(Boolean(result.is_following))
      invalidateCachePrefix('profile:user:')
      invalidateCachePrefix(`feed:user:${userId}`)
      window.dispatchEvent(new Event('daet-notifications-updated'))
    } catch (error) {
      console.error('Author follow update failed:', error)
      setFollowError(error.message || 'Unable to update your follow status.')
    } finally {
      setFollowBusy(false)
    }
  }

  const handleSave = async () => {
    if (!userId) {
      alert('Please log in to save articles')
      return
    }

    try {
      if (isSaved) {
        const { error: deleteError } = await supabase
          .from('user_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('item_type', 'blog')
          .eq('item_id', blogId)
        if (deleteError) throw deleteError
      } else {
        const { error: saveError } = await supabase
          .from('user_favorites')
          .upsert({ user_id: userId, item_type: 'blog', item_id: blogId }, { onConflict: 'user_id,item_type,item_id' })
        if (saveError) throw saveError
      }

      setIsSaved(!isSaved)
      alert(isSaved ? 'Removed from saved items.' : 'Saved for later.')
      if (!isSaved) {
        trackUserActivity({
          userId,
          activityType: 'save_content',
          entityType: 'blog',
          entityId: blogId,
          description: `Saved ${blog?.title || 'article'}`,
          metadata: { contentTitle: blog?.title || 'Article' },
        })
      }
    } catch (error) {
      console.error('Error saving blog:', error)
      alert(error?.message || 'Unable to update saved items right now.')
    }
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
        const response = await fetch('/info/api/blog-comments', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blogId,
            parentId,
            content,
            mentionRefs: replyMentionRefs[parentId] || [],
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to submit your reply.')
        const data = payload.comment

        const replyMentionData = (replyMentionRefs[parentId] || [])
          .filter((mention) => mention?.id)
          .map((mention) => ({
            mentioned_user_id: mention.id,
            display_name: String(mention.id).startsWith('mention-') ? String(mention.id).replace('mention-', '') : mention.displayName,
          }))
        const nextReply = {
          ...data,
          mention_data: data?.mention_data?.length ? data.mention_data : replyMentionData,
          replies: [],
        }
        const appendReply = (items) => (items || []).map((item) => {
          if (String(item.id) === String(parentId)) {
            const existingReplyIds = new Set((item.replies || []).map((reply) => String(reply.id)))
            return existingReplyIds.has(String(nextReply.id))
              ? item
              : { ...item, replies: [...(item.replies || []), nextReply] }
          }
          return item.replies?.length ? { ...item, replies: appendReply(item.replies) } : item
        })
        setComments((prev) => appendReply(prev))
        setReplyMap((prev) => {
          const next = { ...prev }
          delete next[parentId]
          return next
        })
        setReplyMentionRefs((prev) => ({ ...prev, [parentId]: [] }))
        setExpandedReplies((prev) => ({ ...prev, [parentId]: true }))
        setModerationPending((prev) => prev + 1)
      } else {
        const response = await fetch('/info/api/blog-comments', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId, content, mentionRefs: replyMentionRefs.root || [] }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to submit your comment.')
        const data = payload.comment

        trackUserActivity({
          userId,
          activityType: 'comment',
          entityType: 'blog',
          entityId: blogId,
          description: `Commented on ${blog?.title || 'article'}`,
          metadata: { contentTitle: blog?.title || 'Article', body: content },
        })

        const generatedCommentId =
          data?.id ||
          (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `comment-${Date.now()}`)

        const createdComment = {
          id: generatedCommentId,
          blog_id: blogId,
          user_id: userId,
          content,
          status: 'approved',
          created_at: new Date().toISOString(),
          likes: 0,
          replies: [],
          mention_data: data?.mention_data?.length
            ? data.mention_data
            : (replyMentionRefs.root || [])
              .filter((mention) => mention?.id)
              .map((mention) => ({
                mentioned_user_id: mention.id,
                display_name: String(mention.id).startsWith('mention-') ? String(mention.id).replace('mention-', '') : mention.displayName,
              })),
          info_users: data?.info_users || { full_name: userName, email: userName, profile_image_url: null },
        }

        setComments((prev) => [createdComment, ...prev])
        setCommentContent('')
        setReplyMentionRefs((prev) => ({ ...prev, root: [] }))
        setModerationPending((prev) => prev + 1)

        const nextCommentCount = (blog.comments_count || 0) + 1
        await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
        setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
      }
    } catch (error) {
      console.error('Error submitting comment:', error)
      alert(error?.message || 'Unable to submit your comment. Please try again.')
    } finally {
      setSubmittingComment(false)
    }
  }

  const updateReplyDraft = (commentId, value) => {
    setReplyMap((previous) => ({ ...previous, [commentId]: value }))
  }

  const handleStartEditComment = (comment) => {
    setEditingCommentId(comment.id)
    setEditingContent(comment.content || '')
    setDeletingCommentId(null)
  }

  const handleCancelEditComment = () => {
    setEditingCommentId(null)
    setEditingContent('')
  }

  const handleSaveEditComment = async (comment) => {
    const content = editingContent.trim()
    if (!content || !userId || commentModifying) return
    setCommentModifying(true)
    try {
      if (comment.local) {
        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}
        const nextMap = {}
        for (const [parentId, replies] of Object.entries(blogLocalReplies)) {
          nextMap[parentId] = (replies || []).map((r) => (r.id === comment.id ? { ...r, content } : r))
        }
        writeLocalStorage(STORAGE_KEYS.localReplies, { ...localReplies, [blogId]: nextMap })
        setComments((prev) =>
          prev.map((c) => ({
            ...c,
            replies: (c.replies || []).map((r) => (r.id === comment.id ? { ...r, content } : r)),
          }))
        )
      } else {
        const { error } = await supabase
          .from('info_comments')
          .update({ content })
          .eq('id', comment.id)
          .eq('user_id', userId)
        if (error) throw error
        setComments((prev) => prev.map((c) => c.id === comment.id
          ? { ...c, content }
          : { ...c, replies: (c.replies || []).map((reply) => reply.id === comment.id ? { ...reply, content } : reply) }))
      }
      setEditingCommentId(null)
      setEditingContent('')
    } catch (error) {
      console.error('Error editing comment:', error)
      alert('Failed to update comment. Please try again.')
    } finally {
      setCommentModifying(false)
    }
  }

  const handleDeleteComment = async (comment) => {
    if (!userId || commentModifying) return
    setCommentModifying(true)
    try {
      if (comment.local) {
        const localReplies = readLocalStorage(STORAGE_KEYS.localReplies, {})
        const blogLocalReplies = localReplies[blogId] || {}
        const nextMap = {}
        for (const [parentId, replies] of Object.entries(blogLocalReplies)) {
          nextMap[parentId] = (replies || []).filter((r) => r.id !== comment.id)
        }
        writeLocalStorage(STORAGE_KEYS.localReplies, { ...localReplies, [blogId]: nextMap })
        setComments((prev) =>
          prev.map((c) => ({
            ...c,
            replies: (c.replies || []).filter((r) => r.id !== comment.id),
          }))
        )
      } else {
        const { error } = await supabase
          .from('info_comments')
          .delete()
          .eq('id', comment.id)
          .eq('user_id', userId)
        if (error) throw error
        setComments((prev) => prev
          .filter((c) => c.id !== comment.id)
          .map((c) => ({ ...c, replies: (c.replies || []).filter((reply) => reply.id !== comment.id) })))
        const nextCommentCount = Math.max(0, (blog.comments_count || 0) - 1)
        await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
        setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
      }
      setDeletingCommentId(null)
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment. Please try again.')
    } finally {
      setCommentModifying(false)
    }
  }

  const handleReportComment = async (comment) => {
    if (!userId || !comment?.id || comment.user_id === userId) return

    const reason = window.prompt('Why are you reporting this comment?', 'Inappropriate content')?.trim()
    if (!reason) return

    const { error } = await supabase.from('info_moderation').insert({
      report_type: 'comment',
      reason,
      reported_by: userId,
      reported_user_id: comment.user_id,
      reported_item_id: comment.id,
      reported_item_table: 'info_comments',
      status: 'pending',
    })

    if (error) {
      console.error('Comment report failed:', error)
      alert('Unable to submit this report right now.')
      return
    }

    alert('Thanks. Your report was submitted for review.')
  }

  const handleOpenComments = () => {
    commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const flattenReplies = (replies = []) => replies.flatMap((reply) => [reply, ...flattenReplies(reply.replies || [])])

  const renderComment = (comment, showReplies = true) => (
    <div
      key={comment.id}
      className="medium-response-item"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">
              {comment.info_users?.profile_image_url ? <img src={comment.info_users.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(comment.info_users?.full_name || comment.info_users?.email || 'Anonymous')}
            </span>
            <p className="font-semibold text-slate-900">
              {comment.info_users?.full_name || comment.info_users?.email || 'Anonymous'}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{comment.created_at ? new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recently'}</span>
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
        {userId === comment.user_id && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              aria-label="Comment options"
              onClick={() => setMenuCommentId(menuCommentId === comment.id ? null : comment.id)}
              disabled={commentModifying}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {menuCommentId === comment.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuCommentId(null)} />
                <div className="absolute right-0 top-9 z-20 min-w-[140px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleStartEditComment(comment)}
                    disabled={commentModifying}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingCommentId(deletingCommentId === comment.id ? null : comment.id)
                      setMenuCommentId(null)
                    }}
                    disabled={commentModifying}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {editingCommentId === comment.id ? (
        <div className="mt-2">
          <MentionsAutoSuggest
            value={editingContent}
            onChange={setEditingContent}
            userId={userId}
            initialMention={comment.mention_data?.[0]?.mentioned_user_id ? {
              id: comment.mention_data[0].mentioned_user_id,
              full_name: comment.mention_data[0].display_name,
            } : null}
            rows={3}
            autoFocus
            placeholder="Edit your comment..."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveEditComment(comment)}
              disabled={commentModifying || !editingContent.trim()}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {commentModifying ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancelEditComment}
              disabled={commentModifying}
              className="text-xs text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <MentionText text={comment.content} mentions={comment.mention_data} className="mt-2 text-sm text-slate-700" />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-xs">
        <div className="min-w-0 max-w-full">
          <Reactions
            contentType="comment"
            contentId={comment.id}
            userId={userId}
            contentTitle={blog?.title || 'article'}
            compact
            label="reactions"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            const authorName = comment.info_users?.full_name || 'there'
            setReplyMap((prev) => {
              if (Object.prototype.hasOwnProperty.call(prev, comment.id)) {
                const next = { ...prev }
                delete next[comment.id]
                return next
              }
              return { ...prev, [comment.id]: `@${authorName} ` }
            })
            setReplyMentionRefs((prev) => {
              if (prev[comment.id]) {
                const next = { ...prev }
                delete next[comment.id]
                return next
              }
              return { ...prev, [comment.id]: [{ id: comment.user_id, displayName: authorName }] }
            })
            setExpandedReplies((prev) => ({ ...prev, [comment.id]: true }))
          }}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100"
        >
          Reply
        </button>

        {userId && userId !== comment.user_id && (
          <button type="button" onClick={() => handleReportComment(comment)} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-100">
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
        )}
      </div>

      {deletingCommentId === comment.id && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-semibold text-red-700">Delete this comment? This can&apos;t be undone.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDeleteComment(comment)}
              disabled={commentModifying}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {commentModifying ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setDeletingCommentId(null)}
              disabled={commentModifying}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-red-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {replyMap[comment.id] !== undefined && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <MentionsAutoSuggest
              value={replyMap[comment.id] || ''}
              onChange={(value) => updateReplyDraft(comment.id, value)}
              placeholder="Write a reply or mention someone with @..."
              rows={3}
              userId={userId}
              initialMention={replyMentionRefs[comment.id]?.[0] ? {
                id: replyMentionRefs[comment.id][0].id,
                full_name: replyMentionRefs[comment.id][0].displayName,
              } : null}
              onMentionAdded={(user) => setReplyMentionRefs((previous) => ({
                ...previous,
                [comment.id]: [{ id: user.id, displayName: user.mentionToken || user.full_name || 'User' }],
              }))}
            />
          </div>
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

      {showReplies && (comment.replies || []).length > 0 && !expandedReplies[comment.id] && (
        <button
          type="button"
          onClick={() => setExpandedReplies((previous) => ({ ...previous, [comment.id]: true }))}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          View replies ({flattenReplies(comment.replies || []).length})
        </button>
      )}

      {showReplies && (comment.replies || []).length > 0 && expandedReplies[comment.id] && (
        <div className="mt-4 space-y-0">
          {flattenReplies(comment.replies || []).slice(0, visibleReplies[comment.id] || INITIAL_REPLIES).map((reply) => renderComment(reply, false))}
          {flattenReplies(comment.replies || []).length > (visibleReplies[comment.id] || INITIAL_REPLIES) && (
            <button
              type="button"
              onClick={() => setVisibleReplies((previous) => ({
                ...previous,
                [comment.id]: (previous[comment.id] || INITIAL_REPLIES) + REPLIES_PER_PAGE,
              }))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              See more replies ({flattenReplies(comment.replies || []).length - (visibleReplies[comment.id] || INITIAL_REPLIES)})
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpandedReplies((previous) => ({ ...previous, [comment.id]: false }))}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            Hide replies
          </button>
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-detail medium-article-page min-h-screen text-slate-900">
        <UserTopHeader detailMode />
        <div className="usr-section-container mx-auto max-w-3xl px-3 pb-24 pt-3 sm:px-4 lg:px-6">
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

  if (!blog) {
    return (
      <main className="tourism-shell usr-section-page usr-detail medium-article-page flex min-h-screen items-center justify-center p-6 text-slate-900">
        <UserTopHeader detailMode />
        <div className="usr-empty-state max-w-xl">
          <FileText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Article not found</p>
          <p className="mt-1 text-xs text-slate-500">This story may have been unpublished, archived, or removed by its author.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/info/user/dashboard" className="usr-section-primary">Back to feed</Link>
          </div>
        </div>
      </main>
    )
  }

  const authorName = blog.info_users?.full_name || blog.info_users?.email || 'Daet community member'
  const renderArticleCards = (items) => (
    <div className="medium-article-recommendation-grid">
      {items.map((item) => (
        <Link key={item.id} href={`/info/user/blogs/${item.id}`} className="medium-article-recommendation-card">
          {item.featured_image
            ? <Image src={item.featured_image} alt="" width={480} height={270} sizes="(max-width: 640px) 100vw, 50vw" unoptimized={!canOptimizeImage(item.featured_image)} />
            : <span className="medium-article-recommendation-placeholder" aria-hidden="true" />}
          <span className="medium-article-recommendation-copy">
            <span className="medium-article-recommendation-category">{categories[item.category] || item.category || 'Daet story'}</span>
            <strong>{item.title}</strong>
            {item.excerpt && <span>{item.excerpt}</span>}
            <time dateTime={item.published_at || undefined}>{formatDate(item.published_at)}</time>
          </span>
        </Link>
      ))}
    </div>
  )

  return (
    <main className="tourism-shell usr-section-page usr-detail usr-stories medium-article-page min-h-screen text-slate-900">
      <UserTopHeader detailMode />
      <div className="usr-section-container mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-5 lg:px-6">
        <div className="medium-article-layout">
        <article className="medium-article-card mb-5 rounded-[16px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:mb-0">

          <header className="medium-article-header">
          <div className="medium-article-topic-list">
            <span className="medium-article-category">{categories[blog.category] || blog.category || 'Daet story'}</span>
            {Array.isArray(blog.tags) && blog.tags.map((tag, index) => (
              <span key={`${tag}-${index}`} className="medium-article-topic">{tag}</span>
            ))}
          </div>
          <h1 className="medium-article-title mt-4 break-words text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">{blog.title}</h1>
          {blog.excerpt && <p className="medium-article-deck">{blog.excerpt}</p>}
          {blog.location && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500"><span aria-hidden="true">📍</span>{blog.location}</p>}

          <div className="medium-article-byline mt-5 flex items-start gap-3 border-t border-b border-slate-200 py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link href={blog.created_by ? `/info/user/profile/${blog.created_by}` : '/info/user/profile'} aria-label="View author's profile" className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
                {blog.info_users?.profile_image_url ? <img src={blog.info_users.profile_image_url} alt={blog.info_users.full_name || 'Author'} className="h-full w-full object-cover" /> : (blog.info_users?.full_name || blog.info_users?.email || 'A')[0].toUpperCase()}
              </Link>
              <div className="min-w-0">
                <Link href={blog.created_by ? `/info/user/profile/${blog.created_by}` : '/info/user/profile'} className="font-semibold text-slate-900 hover:text-sky-700">{blog.info_users?.full_name || blog.info_users?.email || 'Anonymous'}</Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{calculateReadTime(blog.content)} min read</span>
                  <span>•</span>
                  <span>{formatDate(blog.published_at)}</span>
                  <span>•</span>
                  <span>{shareCount} shares</span>
                </div>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1 pt-1 text-xs text-slate-600 sm:text-sm">
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{(blog.views || 0) + 1}</span>
              </div>
            </div>
          </div>
          </header>

          <div className="medium-article-top-actions medium-article-top-social">
            <SocialActionBar
              contentType="blog"
              contentId={blog.id}
              userId={userId}
              heartOnly
              commentCount={comments.length}
              onToggleComments={handleOpenComments}
              isSaved={isSaved}
              onToggleSave={handleSave}
              originalPost={{ ...blog, author: blog.info_users || blog.author || { id: blog.created_by, full_name: blog.author_name, profile_image_url: blog.author_avatar_url } }}
            />
          </div>

          {detailGallery.length > 0 && (
            <div className="medium-article-gallery">
              <PostMediaCarousel images={detailGallery} />
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {userBadges.length > 0 && userBadges.map((badge) => (
              <span key={badge} className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 border border-amber-200">
                <Star className="h-3.5 w-3.5" />
                {badge}
              </span>
            ))}
          </div>

          <div className="medium-article-reading mt-6 space-y-5 leading-relaxed text-slate-700">
            {blog.content && (
              <div
                className="medium-article-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: blog.content.replace(/\n/g, '<br />') }}
              />
            )}
          </div>

        </article>

        <section className="medium-article-author" aria-labelledby="article-author-heading">
          <Link
            href={articleAuthorId ? `/info/user/profile/${articleAuthorId}` : '/info/user/profile'}
            className="medium-article-author-avatar"
            aria-label={`View ${authorName}'s profile`}
          >
            {blog.info_users?.profile_image_url
              ? <Image src={blog.info_users.profile_image_url} alt="" width={56} height={56} unoptimized={!canOptimizeImage(blog.info_users.profile_image_url)} />
              : authorName.slice(0, 1).toUpperCase()}
          </Link>
          <div className="medium-article-author-copy">
            <p className="medium-article-author-label">Written by</p>
            <h2 id="article-author-heading">
              <Link href={articleAuthorId ? `/info/user/profile/${articleAuthorId}` : '/info/user/profile'}>{authorName}</Link>
            </h2>
            {authorBio && <p>{authorBio}</p>}
            {followError && <p role="alert" className="medium-article-follow-error">{followError}</p>}
          </div>
          {userId !== articleAuthorId && (
            <button
              type="button"
              onClick={handleToggleAuthorFollow}
              disabled={followBusy}
              aria-pressed={isFollowingAuthor}
              className={`medium-article-follow-button ${isFollowingAuthor ? 'is-following' : ''}`}
            >
              {isFollowingAuthor ? <UserCheck aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
              {followBusy ? 'Updating…' : isFollowingAuthor ? 'Following' : 'Follow'}
            </button>
          )}
        </section>

        <section ref={commentsSectionRef} className="medium-article-comments mb-5">
          {commentLoadError && (
            <div className="medium-article-editorial-error mb-4" role="status">
              <p>{commentLoadError}</p>
              <button type="button" onClick={() => setCommentReloadKey((key) => key + 1)}>Refresh comments</button>
            </div>
          )}
          <h2 className="medium-response-heading">Responses ({comments.length})</h2>
          {userId ? (
            <div className="medium-response-composer">
              <span className="medium-response-avatar" aria-hidden="true">
                {userProfileImage
                  ? <img src={userProfileImage} alt="" />
                  : getInitials(userName)}
              </span>
              <span className="medium-response-composer-name">{userName}</span>
              <div className="medium-response-input">
                <MentionsAutoSuggest
                  value={commentContent}
                  onChange={setCommentContent}
                  placeholder="What are your thoughts?"
                  rows={1}
                  userId={userId}
                  onMentionAdded={(mention) => setReplyMentionRefs((previous) => ({
                    ...previous,
                    root: [...(previous.root || []).filter((item) => item.id !== mention.id), { id: mention.id, displayName: mention.mentionToken || mention.full_name }],
                  }))}
                />
                <button
                  type="button"
                  onClick={() => handleCommentSubmit()}
                  disabled={submittingComment || !commentContent.trim()}
                  aria-label="Post response"
                  title={submittingComment ? 'Posting response' : 'Post response'}
                  className="medium-response-submit"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="medium-response-composer medium-response-signin">
              <span className="medium-response-avatar" aria-hidden="true">?</span>
              <Link href="/info/login" className="medium-response-input">Sign in to share your thoughts</Link>
            </div>
          )}
          {moderationPending > 0 && (
            <div className="mb-3 flex justify-end">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                {moderationPending} pending moderation
              </span>
            </div>
          )}

          {comments.length > 0 ? (
            <div className="medium-response-list">
              {comments.slice(0, visibleComments).map((comment) => renderComment(comment))}
              {comments.length > visibleComments && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleComments((v) => v + COMMENTS_PER_PAGE)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    See More Comments ({comments.length - visibleComments})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-500">No comments yet. Be the first to share your thoughts!</p>
            </div>
          )}

        </section>

        <section className="medium-article-recommendations" aria-label="More stories">
          {editorialError ? (
            <div className="medium-article-editorial-error" role="status">
              <p>{editorialError}</p>
              <button type="button" onClick={() => setEditorialReloadKey((key) => key + 1)}>Try again</button>
            </div>
          ) : editorialLoading ? (
            <p className="medium-article-editorial-status" role="status">Finding more stories…</p>
          ) : (
            <>
              {authorBlogs.length > 0 && (
                <section className="medium-article-recommendation-section">
                  <h2>More from {authorName}</h2>
                  {renderArticleCards(authorBlogs)}
                </section>
              )}
              {relatedBlogs.length > 0 && (
                <section className="medium-article-recommendation-section">
                  <h2>More in {categories[blog.category] || blog.category}</h2>
                  {renderArticleCards(relatedBlogs)}
                </section>
              )}
              {interestBlogs.length > 0 && (
                <section className="medium-article-recommendation-section">
                  <h2>Picked for your interests</h2>
                  {renderArticleCards(interestBlogs)}
                </section>
              )}
              {popularBlogs.length > 0 && (
                <section className="medium-article-recommendation-section">
                  <h2>Popular on Daet Connect</h2>
                  {renderArticleCards(popularBlogs)}
                </section>
              )}
            </>
          )}
        </section>
        </div>

      </div>

    </main>
  )
}
