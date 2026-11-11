'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import {
  Bookmark,
  ChevronDown,
  Clock,
  Eye,
  Heart,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  List,
  Printer,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { invalidateCachePrefix } from '@/lib/cache'
import { getAuthorDisplayName } from '@/lib/userSocialDisplay'
import Reactions from '@/app/(subsystems)/info/components/user/Reactions'
import MentionText from '@/app/(subsystems)/info/components/user/MentionText'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'

const STORAGE_KEYS = {
  shareCounts: 'daet_blog_share_counts',
}

const INITIAL_COMMENTS = 3
const COMMENTS_PER_PAGE = 3

function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function calculateReadTime(content) {
  if (!content) return 1
  const wordCount = content.trim().split(/\s+/).length
  return Math.max(1, Math.ceil(wordCount / 200))
}

function readLocalStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeLocalStorage(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore local storage failures quietly
  }
}

function getContentHeadings(content) {
  if (!content) return []
  return [...content.matchAll(/<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi)]
    .map((match, index) => ({
      id: `section-${index + 1}`,
      label: match[1].replace(/<[^>]+>/g, '').trim(),
    }))
    .filter((heading) => heading.label)
}

function addContentHeadingIds(content) {
  let index = 0
  return (content || '').replace(/<h([2-3])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attributes, label) => {
    index += 1
    return `<h${level}${attributes} id="section-${index}">${label}</h${level}>`
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

const defaultBlogImage = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80'

export default function PublicBlogDetailPage() {
  const router = useRouter()
  const params = useParams()
  const blogId = params?.id
  const [blog, setBlog] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState('Guest')
  const [userProfileImage, setUserProfileImage] = useState('')
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [commentContent, setCommentContent] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [shareCount, setShareCount] = useState(0)
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [deletingCommentId, setDeletingCommentId] = useState(null)
  const [commentModifying, setCommentModifying] = useState(false)
  const [menuCommentId, setMenuCommentId] = useState(null)
  const [visibleComments, setVisibleComments] = useState(INITIAL_COMMENTS)
  const [showAuthModal, setShowAuthModal] = useState(false)
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
        }

        if (!blogId) return

        setShareCount(readLocalStorage(`${STORAGE_KEYS.shareCounts}_${blogId}`, 0))

        const { data: blogData, error: blogError } = await supabase
          .from('info_blogs')
          .select('*')
          .eq('id', blogId)
          .eq('status', 'published')
          .eq('approval_status', 'approved')
          .single()

        if (blogError) {
          console.error('Error loading blog:', blogError)
        } else if (blogData && !ignore) {
          let blogAuthor = null
          if (blogData.created_by) {
            const [authorResult, profileResult] = await Promise.all([
              supabase.from('info_users')
                .select('id, full_name, email, profile_image_url, user_type')
                .eq('id', blogData.created_by)
                .maybeSingle(),
              supabase.from('profiles')
                .select('full_name, profile_image_url')
                .eq('user_id', blogData.created_by)
                .maybeSingle(),
            ])
            if (authorResult.error) {
              console.error('Blog author profile load failed:', authorResult.error)
            } else {
              if (profileResult.error) console.error('Blog author display profile load failed:', profileResult.error)
              blogAuthor = {
                ...authorResult.data,
                full_name: authorResult.data?.full_name?.trim() || profileResult.data?.full_name?.trim(),
                profile_image_url: profileResult.data?.profile_image_url || authorResult.data?.profile_image_url,
              }
            }
          }
          if (ignore) return
          setBlog({ ...blogData, info_users: blogAuthor })

          const { data: reactionRows, error: reactionError } = await supabase
            .from('content_reactions')
            .select('user_id, reaction_type')
            .eq('content_type', 'blog')
            .eq('content_id', blogId)
            .eq('reaction_type', 'like')

          if (reactionError) throw reactionError
          setIsLiked(Boolean(currentUserId && (reactionRows || []).some((reaction) => reaction.user_id === currentUserId)))
          setBlog((previous) => ({ ...previous, likes: reactionRows?.length || 0 }))

          const commentsResponse = await fetch(`/info/api/blog-comments?blogId=${encodeURIComponent(blogId)}`, { credentials: 'same-origin', cache: 'no-store' })
          const commentsPayload = await commentsResponse.json().catch(() => ({}))
          if (!commentsResponse.ok || !commentsPayload.success) {
            throw new Error(commentsPayload.message || 'Unable to load comments.')
          }

          setComments(commentsPayload.comments || [])
          setVisibleComments(INITIAL_COMMENTS)

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

  const articleAuthorId = blog?.created_by || blog?.info_users?.id || ''
  const articleCategory = blog?.category || ''

  useEffect(() => {
    if (!blogId || !articleAuthorId) return undefined

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
            .eq('approval_status', 'approved')
            .eq('created_by', articleAuthorId)
            .neq('id', blogId)
            .order('published_at', { ascending: false })
            .limit(4),
          articleCategory
            ? supabase
                .from('info_blogs')
                .select('id, title, excerpt, featured_image, published_at, category')
                .eq('status', 'published')
                .eq('approval_status', 'approved')
                .eq('category', articleCategory)
                .neq('id', blogId)
                .neq('created_by', articleAuthorId)
                .order('published_at', { ascending: false })
                .limit(4)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('info_blogs')
            .select('id, title, excerpt, featured_image, published_at, category')
            .eq('status', 'published')
            .eq('approval_status', 'approved')
            .neq('id', blogId)
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

        const interestCategories = getInterestCategoryValues(preferenceResult.data?.preferred_categories || [])
        const interestResult = interestCategories.length
          ? await supabase
              .from('info_blogs')
              .select('id, title, excerpt, featured_image, published_at, category')
              .eq('status', 'published')
              .eq('approval_status', 'approved')
              .in('category', interestCategories)
              .neq('id', blogId)
              .neq('created_by', articleAuthorId)
              .order('published_at', { ascending: false })
              .limit(8)
          : { data: [], error: null }
        if (interestResult.error) throw interestResult.error
        if (ignore) return

        const alreadyRecommended = new Set([
          blogId,
          ...(authorResult.data || []).map((item) => item.id),
          ...(relatedResult.data || []).map((item) => item.id),
        ].map(String))
        const uniqueInterestBlogs = (interestResult.data || []).filter((item) => !alreadyRecommended.has(String(item.id)))
        uniqueInterestBlogs.forEach((item) => alreadyRecommended.add(String(item.id)))

        setAuthorBio(profileResult.data?.is_public !== false || followResult.data
          ? profileResult.data?.bio || ''
          : '')
        setIsFollowingAuthor(Boolean(followResult.data))
        setAuthorBlogs(authorResult.data || [])
        setRelatedBlogs(relatedResult.data || [])
        setInterestBlogs(uniqueInterestBlogs)
        setPopularBlogs((popularResult.data || []).filter((item) => !alreadyRecommended.has(String(item.id))))
      } catch (error) {
        console.error('Public article recommendations failed:', error)
        if (!ignore) setEditorialError('Author details and recommendations could not be loaded.')
      } finally {
        if (!ignore) setEditorialLoading(false)
      }
    }

    void loadEditorialContext()
    return () => {
      ignore = true
    }
  }, [blogId, articleAuthorId, articleCategory, userId, editorialReloadKey])

  const handleToggleAuthorFollow = async () => {
    if (!articleAuthorId || followBusy) return
    if (!userId) {
      router.push('/info/login?message=Please+sign+in+to+follow+this+author.')
      return
    }

    setFollowBusy(true)
    setFollowError('')
    try {
      const response = await fetch(`/info/api/users/${encodeURIComponent(articleAuthorId)}/follow`, {
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
      console.error('Public article author follow failed:', error)
      setFollowError(error.message || 'Unable to update your follow status.')
    } finally {
      setFollowBusy(false)
    }
  }

  const handleLike = async () => {
    if (!userId) {
      setShowAuthModal(true)
      return
    }

    try {
      const result = isLiked
        ? await supabase
            .from('content_reactions')
            .delete()
            .eq('user_id', userId)
            .eq('content_type', 'blog')
            .eq('content_id', blogId)
        : await supabase
            .from('content_reactions')
            .upsert(
              { user_id: userId, content_type: 'blog', content_id: blogId, reaction_type: 'like' },
              { onConflict: 'user_id,content_type,content_id' }
            )

      if (result.error) throw result.error
      const nextLikeCount = Math.max(0, (blog.likes || 0) + (isLiked ? -1 : 1))
      setIsLiked(!isLiked)
      setBlog((prev) => ({ ...prev, likes: nextLikeCount }))
      if (!isLiked && userId) {
        trackUserActivity({
          userId,
          activityType: 'react_content',
          entityType: 'blog',
          entityId: blogId,
          description: `Liked ${blog?.title || 'article'}`,
          metadata: { contentTitle: blog?.title || 'Article' },
        })
      }
    } catch (error) {
      console.error('Error liking blog:', error)
    }
  }

  const handleSave = async () => {
    if (!userId) {
      setShowAuthModal(true)
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
      } else {
        await supabase.from('user_favorites').insert({
          user_id: userId,
          item_type: 'blog',
          item_id: blogId,
        })
      }

      setIsSaved(!isSaved)
      if (!isSaved && userId) {
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
    }
  }

  const handleCommentSubmit = async () => {
    const content = commentContent.trim()
    if (!content) return

    setSubmittingComment(true)
    try {
      if (!userId) {
        setShowAuthModal(true)
        return
      }

      const response = await fetch('/info/api/blog-comments', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId, content }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to submit your comment.')

      trackUserActivity({
        userId,
        activityType: 'comment',
        entityType: 'blog',
        entityId: blogId,
        description: `Commented on ${blog?.title || 'article'}`,
        metadata: { contentTitle: blog?.title || 'Article', body: content },
      })

      const createdComment = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `comment-${Date.now()}`,
        blog_id: blogId,
        user_id: userId,
        content,
        status: 'approved',
        created_at: new Date().toISOString(),
        likes: 0,
        info_users: payload.comment?.info_users || { full_name: userName, email: userName, profile_image_url: null },
      }

      setComments((prev) => [createdComment, ...prev])
      setCommentContent('')

      const nextCommentCount = (blog.comments_count || 0) + 1
      await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
      setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
    } catch (error) {
      console.error('Error submitting comment:', error)
      alert(error?.message || 'Unable to submit your comment. Please try again.')
    } finally {
      setSubmittingComment(false)
    }
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
      const { error } = await supabase
        .from('info_comments')
        .update({ content })
        .eq('id', comment.id)
        .eq('user_id', userId)
      if (error) throw error
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, content } : c)))
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
      const { error } = await supabase
        .from('info_comments')
        .delete()
        .eq('id', comment.id)
        .eq('user_id', userId)
      if (error) throw error
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      setDeletingCommentId(null)
      const nextCommentCount = Math.max(0, (blog.comments_count || 0) - 1)
      await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
      setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
    } catch (error) {
      console.error('Error deleting comment:', error)
      alert('Failed to delete comment. Please try again.')
    } finally {
      setCommentModifying(false)
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

    if (userId && (platform !== 'copy' && platform !== 'email')) {
      trackUserActivity({
        userId,
        activityType: 'share_content',
        entityType: 'blog',
        entityId: blogId,
        description: `Shared ${blog?.title || 'article'}`,
        metadata: { contentTitle: blog?.title || 'Article', platform },
      })
    }

    setShowShareMenu(false)
  }

  if (loading) {
    return (
      <main className="medium-article-page visitor-blog-detail min-h-screen px-3 py-6 sm:px-4 lg:px-6">
        <UserTopHeader spacer homeHref="/info/visitor" />
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 h-16 animate-pulse rounded-[20px] bg-slate-200" />
          <div className="mb-6 h-96 animate-pulse rounded-[20px] bg-slate-200" />
        </div>
      </main>
    )
  }

  if (!blog) {
    return (
      <main className="medium-article-page visitor-blog-detail min-h-screen px-3 py-6 sm:px-4 lg:px-6">
        <UserTopHeader spacer homeHref="/info/visitor" />
        <div className="mx-auto max-w-3xl rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Article not found.</p>
          <Link href="/info/visitor" className="mt-3 hidden text-xs font-semibold text-sky-600 hover:underline lg:inline">
            Back to Home
          </Link>
        </div>
      </main>
    )
  }

  const contentHeadings = getContentHeadings(blog.content)
  const adminCurated = blog.tags?.includes('admin-curated')
  const blogAuthorName = getAuthorDisplayName(
    { ...(blog.info_users || (adminCurated ? { user_type: 'admin' } : {})), name: blog.info_users?.email },
    adminCurated ? 'Daet Tourism Admin' : 'Anonymous',
  )
  const renderArticleCards = (items) => (
    <div className="medium-article-recommendation-grid">
      {items.map((item) => (
        <Link key={item.id} href={`/info/visitor/blog/${item.id}`} className="medium-article-recommendation-card">
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
    <main className="medium-article-page visitor-blog-detail min-h-screen text-slate-900">
      <UserTopHeader spacer homeHref="/info/visitor" />
      <style>{`@media print { body { background: white !important; } .print-hidden { display: none !important; } .print-article { border: 0 !important; box-shadow: none !important; } }`}</style>
      {showAuthModal && !userId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Bookmark className="h-6 w-6" /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Keep exploring with Daet Connect</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Create a free account to save this guide and build your trip list.</p>
            <div className="mt-5 grid gap-2"><Link href="/info/register" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Create free account</Link><Link href="/info/login" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Sign in</Link></div>
            <button type="button" onClick={() => setShowAuthModal(false)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800">Continue reading</button>
          </div>
        </div>
      )}
      <div className="medium-article-container mx-auto max-w-3xl px-3 py-6 sm:px-4 lg:px-6">
        <article className="medium-article-card print-article mb-8 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-8">
          <div className="medium-article-topic-list">
            <span className="medium-article-category">
              {blog.category === 'food' ? '🥘 Food Diary' : blog.category === 'budget' ? '💰 Budget Tips' : blog.category === 'travel_guides' ? '📍 Destination Guide' : categories[blog.category] || blog.category}
            </span>
            {Array.isArray(blog.tags) && blog.tags.map((tag, index) => (
              <span key={`${tag}-${index}`} className="medium-article-topic">{tag}</span>
            ))}
          </div>

          <h1 className="medium-article-title mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">{blog.title}</h1>
          {blog.excerpt && <p className="medium-article-deck">{blog.excerpt}</p>}
          {blog.location && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500"><span aria-hidden="true">📍</span>{blog.location}</p>}

          <div className="medium-article-byline mt-6 flex items-center justify-between border-t border-b border-slate-200 py-4">
            <div className="flex items-center gap-3">
              <Link href={blog.info_users?.id ? `/info/user/profile/${blog.info_users.id}` : '/info/user/profile'} aria-label={`View ${blogAuthorName}'s profile`} className="medium-article-author-avatar">
                {blog.info_users?.profile_image_url
                  ? <Image src={blog.info_users.profile_image_url} alt="" width={48} height={48} unoptimized={!canOptimizeImage(blog.info_users.profile_image_url)} />
                  : blogAuthorName[0].toUpperCase()}
              </Link>
              <div>
                <Link href={blog.info_users?.id ? `/info/user/profile/${blog.info_users.id}` : '/info/user/profile'} className="font-semibold text-slate-900">{blogAuthorName}</Link>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(blog.published_at)}</span>
                  <span>•</span>
                  <span>{calculateReadTime(blog.content)} min read</span>
                  <span>•</span>
                  <span>{shareCount} shares</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                <span>{blog.views || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                <span>{blog.likes || 0} Likes</span>
              </div>
            </div>
          </div>

          <div className="medium-article-top-actions print-hidden" aria-label="Article actions">
            <div className="flex items-center gap-2">
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
              <button type="button" onClick={() => window.print()} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Print or save as PDF"><Printer className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="medium-article-gallery">
            <div className="overflow-hidden">
              <Image
                alt={blog.title}
                src={blog.featured_image || defaultBlogImage}
                width={1200}
                height={675}
                sizes="(max-width: 760px) 100vw, 760px"
                className="h-auto max-h-[34rem] w-full object-cover"
                unoptimized={!canOptimizeImage(blog.featured_image || defaultBlogImage)}
              />
            </div>
          </div>

          <div className="medium-article-reading mt-8 space-y-6 leading-relaxed text-slate-700">

            {contentHeadings.length > 0 && (
              <nav className="not-prose rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Table of contents">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900"><List className="h-4 w-4 text-sky-600" /> In this guide</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{contentHeadings.map((heading, index) => <a key={heading.id} href={`#section-${index + 1}`} className="text-sm font-semibold text-sky-700 hover:underline">{heading.label}</a>)}</div>
              </nav>
            )}

            {blog.content && (
              <div
                className="medium-article-content prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: addContentHeadingIds(blog.content).replace(/\n/g, '<br />') }}
              />
            )}
          </div>

        </article>

        <section className="medium-article-author" aria-labelledby="public-article-author-heading">
          <Link
            href={articleAuthorId ? `/info/user/profile/${articleAuthorId}` : '/info/user/profile'}
            className="medium-article-author-avatar"
            aria-label={`View ${blogAuthorName}'s profile`}
          >
            {blog.info_users?.profile_image_url
              ? <Image src={blog.info_users.profile_image_url} alt="" width={56} height={56} unoptimized={!canOptimizeImage(blog.info_users.profile_image_url)} />
              : blogAuthorName.slice(0, 1).toUpperCase()}
          </Link>
          <div className="medium-article-author-copy">
            <p className="medium-article-author-label">Written by</p>
            <h2 id="public-article-author-heading">
              <Link href={articleAuthorId ? `/info/user/profile/${articleAuthorId}` : '/info/user/profile'}>{blogAuthorName}</Link>
            </h2>
            {authorBio && <p>{authorBio}</p>}
            {followError && <p role="alert" className="medium-article-follow-error">{followError}</p>}
          </div>
          {userId !== articleAuthorId && articleAuthorId && (
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

        <aside className="medium-article-comments print-hidden mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Plan around this story</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">More from your destination</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href="/info/visitor/tourist-spots" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">Tourist spots →</Link>
            <Link href="/info/visitor#community" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">Active forums →</Link>
            <Link href="/info/visitor#blogs" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">More stories →</Link>
          </div>
        </aside>

        <section className="medium-article-comments medium-responses-section mb-8">
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
                <textarea
                  value={commentContent}
                  onChange={(event) => setCommentContent(event.target.value)}
                  placeholder="What are your thoughts?"
                  rows={1}
                />
                <button
                  type="button"
                  onClick={handleCommentSubmit}
                  disabled={submittingComment || !commentContent.trim()}
                  aria-label="Post response"
                  title={submittingComment ? 'Posting response' : 'Post response'}
                  className="medium-response-submit"
                >
                  <Send className="h-4 w-4" />
                  <span>{submittingComment ? 'Posting...' : 'Post'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="medium-response-composer medium-response-signin">
              <span className="medium-response-avatar" aria-hidden="true">?</span>
              <Link href="/info/login" className="medium-response-input">Sign in to share your thoughts</Link>
              <Link href="/info/register" className="medium-response-register">Join</Link>
            </div>
          )}

          {comments.length > 0 ? (
            <div className="medium-response-list">
              {comments.slice(0, visibleComments).map((comment) => {
                const isCommentOwner = userId === comment.user_id
                return (
                <div key={comment.id} className="medium-response-item">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">
                          {comment.info_users?.profile_image_url ? <img src={comment.info_users.profile_image_url} alt="" className="h-full w-full object-cover" /> : String(comment.info_users?.full_name || comment.info_users?.email || 'Anonymous').charAt(0).toUpperCase()}
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
                      </div>
                    </div>
                    {isCommentOwner && (
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
                      <textarea
                        value={editingContent}
                        onChange={(event) => setEditingContent(event.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Edit your comment..."
                        className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-1 focus:ring-sky-200"
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

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <div className="min-w-42.5 max-w-full">
                      <Reactions
                        contentType="comment"
                        contentId={comment.id}
                        userId={userId}
                        onRequireAuth={() => setShowAuthModal(true)}
                        contentTitle={blog?.title || 'article'}
                        compact
                        label="reactions"
                      />
                    </div>
                    {(comment.replies || []).length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="font-semibold">{(comment.replies || []).length} Replies</span>
                      </span>
                    )}
                  </div>
                </div>
                )
              })}
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
                  <h2>More from {blogAuthorName}</h2>
                  {renderArticleCards(authorBlogs)}
                </section>
              )}
              {relatedBlogs.length > 0 && (
                <section className="medium-article-recommendation-section">
                  <h2>More in {categories[articleCategory] || articleCategory}</h2>
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
    </main>
  )
}