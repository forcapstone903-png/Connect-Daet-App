'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'

const STORAGE_KEYS = {
  shareCounts: 'daet_blog_share_counts',
}

const INITIAL_COMMENTS = 5
const COMMENTS_PER_PAGE = 5

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

const defaultBlogImage = 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80'

export default function PublicBlogDetailPage() {
  const router = useRouter()
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

        if (!blogId) return

        setShareCount(readLocalStorage(`${STORAGE_KEYS.shareCounts}_${blogId}`, 0))

        const { data: blogData, error: blogError } = await supabase
          .from('info_blogs')
          .select('*, info_users(full_name, email)')
          .eq('id', blogId)
          .single()

        if (blogError) {
          console.error('Error loading blog:', blogError)
        } else if (blogData && !ignore) {
          setBlog(blogData)

          const { data: reactionRows } = await supabase
            .from('content_reactions')
            .select('user_id, reaction_type')
            .eq('content_type', 'blog')
            .eq('content_id', blogId)

          setIsLiked(Boolean(userId && (reactionRows || []).some((reaction) => reaction.user_id === userId && reaction.reaction_type === 'like')))
          setBlog((previous) => ({ ...previous, likes: reactionRows?.length || 0 }))

          await supabase.from('info_blogs').update({ views: (blogData.views || 0) + 1 }).eq('id', blogId)

          const { data: commentsData } = await supabase
            .from('info_comments')
            .select('*, info_users(full_name, email)')
            .eq('blog_id', blogId)
            .order('created_at', { ascending: false })

          setComments(commentsData || [])
          setVisibleComments(INITIAL_COMMENTS)

          const { data: relatedData } = await supabase
            .from('info_blogs')
            .select('*, info_users(full_name, email)')
            .eq('status', 'published')
            .eq('category', blogData.category)
            .neq('id', blogId)
            .order('views', { ascending: false })
            .limit(3)

          setRelatedBlogs(relatedData || [])

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
    if (userId || !blog) return undefined
    const handleScroll = () => {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 220) {
        setShowAuthModal(true)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [blog, userId])

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

      const { error } = await supabase.from('info_comments').insert({
        blog_id: blogId,
        user_id: userId,
        content,
        status: 'pending',
      })

      if (error) throw error

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
        status: 'pending',
        created_at: new Date().toISOString(),
        likes: 0,
        info_users: { full_name: userName, email: userName },
      }

      setComments((prev) => [createdComment, ...prev])
      setCommentContent('')

      const nextCommentCount = (blog.comments_count || 0) + 1
      await supabase.from('info_blogs').update({ comments_count: nextCommentCount }).eq('id', blogId)
      setBlog((prev) => ({ ...prev, comments_count: nextCommentCount }))
    } catch (error) {
      console.error('Error submitting comment:', error)
      alert('An error occurred. Please try again.')
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
          <Link href="/visitor" className="mt-3 text-xs font-semibold text-sky-600 hover:underline">
            Back to Home
          </Link>
        </div>
      </main>
    )
  }

  const contentHeadings = getContentHeadings(blog.content)

  return (
    <main className="min-h-screen bg-[#f3f5f9] text-slate-900">
      <style>{`@media print { body { background: white !important; } .print-hidden { display: none !important; } .print-article { border: 0 !important; box-shadow: none !important; } }`}</style>
      {showAuthModal && !userId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Bookmark className="h-6 w-6" /></div>
            <h2 className="mt-4 text-xl font-black text-slate-900">Keep exploring with Daet Connect</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Create a free account to save this guide and build your trip list.</p>
            <div className="mt-5 grid gap-2"><Link href="/register" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Create free account</Link><Link href="/login" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Sign in</Link></div>
            <button type="button" onClick={() => setShowAuthModal(false)} className="mt-4 text-xs font-semibold text-slate-500 hover:text-slate-800">Continue reading</button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 lg:px-6">
        <div className="print-hidden mb-6 flex items-center justify-between">
          <Link href="/visitor" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>

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

        <article className="print-article mb-8 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-8">
          {blog.featured_image ? (
            <div className="mb-6 overflow-hidden rounded-[16px]">
              <img alt={blog.title} src={blog.featured_image} className="h-96 w-full object-cover" />
            </div>
          ) : (
            <div className="mb-6 overflow-hidden rounded-[16px]">
              <img alt={blog.title} src={defaultBlogImage} className="h-96 w-full object-cover" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-bold uppercase text-sky-700">
              {blog.category === 'food' ? '🥘 Food Diary' : blog.category === 'budget' ? '💰 Budget Tips' : blog.category === 'travel_guides' ? '📍 Destination Guide' : categories[blog.category] || blog.category}
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
                <span>{blog.likes || 0} Likes</span>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-6 leading-relaxed text-slate-700">
            {blog.excerpt && <p className="text-lg italic text-slate-600">{blog.excerpt}</p>}

            {contentHeadings.length > 0 && (
              <nav className="not-prose rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Table of contents">
                <div className="flex items-center gap-2 text-sm font-black text-slate-900"><List className="h-4 w-4 text-sky-600" /> In this guide</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{contentHeadings.map((heading, index) => <a key={heading.id} href={`#section-${index + 1}`} className="text-sm font-semibold text-sky-700 hover:underline">{heading.label}</a>)}</div>
              </nav>
            )}

            {blog.content && (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: addContentHeadingIds(blog.content).replace(/\n/g, '<br />') }}
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

        <aside className="print-hidden mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Plan around this story</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">More from your destination</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link href="/tourist-spots" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">Tourist spots →</Link>
            <Link href="/visitor#community" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">Active forums →</Link>
            <Link href="/visitor#blogs" className="rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-800 hover:border-sky-300">More stories →</Link>
          </div>
        </aside>

        <section className="mb-8">
          <h2 className="mb-4 text-2xl font-bold text-slate-900">{comments.length} Comments</h2>

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
                onClick={handleCommentSubmit}
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
              {comments.slice(0, visibleComments).map((comment) => {
                const isCommentOwner = userId === comment.user_id
                return (
                <div key={comment.id} className="rounded-[20px] border border-slate-200 bg-white p-4">
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
                    <p className="mt-2 text-sm text-slate-700">{comment.content}</p>
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
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100">
                      <Heart className="h-3.5 w-3.5" />
                      <span className="font-semibold">{comment.likes || 0} Likes</span>
                    </button>
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

        {relatedBlogs.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-bold text-slate-900">Related Articles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {relatedBlogs.map((relatedBlog) => (
                <Link key={relatedBlog.id} href={`/blog/${relatedBlog.id}`} className="group overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm transition hover:shadow-lg hover:border-sky-200">
                  <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-sky-400 to-blue-600">
                    {relatedBlog.featured_image ? (
                      <img alt={relatedBlog.title} src={relatedBlog.featured_image} className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><span className="text-3xl opacity-50">📰</span></div>
                    )}
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition" />
                  </div>

                  <div className="p-4">
                    <h3 className="text-base font-bold text-slate-900 line-clamp-2 group-hover:text-sky-700">{relatedBlog.title}</h3>
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