'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sanitizeRichText } from '@/lib/sanitizeRichText'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import {
  Bookmark,
  List,
  Heart,
  Eye,
  Mail,
  MessageSquare,
  Share2,
  MapPin,
  Utensils,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import VisitorBackButton from '@/app/(subsystems)/info/components/visitor/VisitorBackButton'
import { trackUserActivity } from '@/lib/trackActivity'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { getStoryRecommendationCategories } from '@/lib/userInterests'
import { getAuthorDisplayName } from '@/lib/userSocialDisplay'

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
  const params = useParams()
  const blogId = params?.id
  const [blog, setBlog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [engagementCounts, setEngagementCounts] = useState(null)
  const [engagementError, setEngagementError] = useState('')
  const [authorBlogs, setAuthorBlogs] = useState([])
  const [relatedBlogs, setRelatedBlogs] = useState([])
  const [interestBlogs, setInterestBlogs] = useState([])
  const [popularBlogs, setPopularBlogs] = useState([])
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
        if (currentUserId) setUserId(currentUserId)

        if (!blogId) return

        const { data: blogData, error: blogError } = await supabase
          .from('info_blogs')
          .select('id, title, created_by, tags, category, excerpt, location, published_at, created_at, content, featured_image')
          .eq('id', blogId)
          .eq('status', 'published')
          .eq('approval_status', 'approved')
          .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
          .single()

        if (blogError) {
          console.error('Error loading blog:', blogError)
        } else if (blogData && !ignore) {
          let blogAuthor = null
          if (blogData.created_by) {
            const authorResult = await supabase.from('info_users')
              .select('id, full_name, user_type, profile_image_url')
              .eq('id', blogData.created_by)
              .maybeSingle()
            if (authorResult.error) {
              console.error('Blog author name load failed:', authorResult.error)
            }
            blogAuthor = authorResult.data
          }
          if (ignore) return
          setBlog({ ...blogData, info_users: blogAuthor })

          try {
            const engagementResponse = await fetch(`/info/api/blog-engagement/${encodeURIComponent(blogId)}`, { cache: 'no-store' })
            const engagementPayload = await engagementResponse.json().catch(() => ({}))
            if (!engagementResponse.ok || !engagementPayload.success) {
              throw new Error(engagementPayload.message || 'Unable to load blog engagement counts.')
            }
            if (!ignore) {
              setEngagementCounts({
                hearts: engagementPayload.hearts,
                saves: engagementPayload.saves,
                views: engagementPayload.views,
                comments: engagementPayload.comments,
              })
              if (engagementPayload.authorProfileImage) {
                setBlog((previous) => previous
                  ? {
                    ...previous,
                    info_users: { ...previous.info_users, profile_image_url: engagementPayload.authorProfileImage },
                  }
                  : previous)
              }
            }
          } catch (error) {
            console.error('Blog engagement counts failed:', error)
            if (!ignore) setEngagementError('Engagement totals are unavailable.')
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
        const [authorResult, relatedResult, popularResult, preferenceResult] = await Promise.all([
          supabase
            .from('info_blogs')
            .select('id, title, excerpt, featured_image, published_at, category')
            .eq('status', 'published')
            .eq('approval_status', 'approved')
            .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
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
                .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
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
            .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
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

        const failedResult = [authorResult, relatedResult, popularResult, preferenceResult]
          .find((result) => result.error)
        if (failedResult) throw failedResult.error

        const interestCategories = getStoryRecommendationCategories(preferenceResult.data?.preferred_categories || [])
        const interestResult = interestCategories.length
          ? await supabase
              .from('info_blogs')
              .select('id, title, excerpt, featured_image, published_at, category')
              .eq('status', 'published')
              .eq('approval_status', 'approved')
              .or(`published_at.is.null,published_at.lte.${new Date().toISOString()}`)
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

        setAuthorBlogs(authorResult.data || [])
        setRelatedBlogs(relatedResult.data || [])
        setInterestBlogs(uniqueInterestBlogs)
        setPopularBlogs((popularResult.data || []).filter((item) => !alreadyRecommended.has(String(item.id))))
      } catch (error) {
        console.error('Public article recommendations failed:', error)
        if (!ignore) setEditorialError('Recommendations could not be loaded.')
      } finally {
        if (!ignore) setEditorialLoading(false)
      }
    }

    void loadEditorialContext()
    return () => {
      ignore = true
    }
  }, [blogId, articleAuthorId, articleCategory, userId, editorialReloadKey])

  const handleShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = blog?.title || 'Check out this article'

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
        window.open(shareUrls[platform], '_blank', 'noopener,noreferrer')
      }
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
        <div className="mx-auto max-w-3xl rounded-[20px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">Article not found.</p>
          <div className="mt-3 hidden lg:block"><VisitorBackButton /></div>
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
      <div className="medium-article-container mx-auto max-w-3xl px-3 py-6 sm:px-4 lg:px-6">
        <article className="medium-article-card mb-8 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <div className="medium-article-topic-list min-w-0 flex-1">
              <span className="medium-article-category inline-flex items-center gap-1">
                {blog.category === 'food'
                  ? <Utensils className="h-3.5 w-3.5" aria-hidden="true" />
                  : blog.category === 'budget'
                    ? <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                    : blog.category === 'travel_guides'
                      ? <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      : null}
                {blog.category === 'food' ? 'Food Diary' : blog.category === 'budget' ? 'Budget Tips' : blog.category === 'travel_guides' ? 'Destination Guide' : categories[blog.category] || blog.category}
              </span>
              {Array.isArray(blog.tags) && blog.tags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="medium-article-topic">{tag}</span>
              ))}
            </div>
            <div className="relative shrink-0">
              <button type="button" onClick={() => setShowShareMenu(!showShareMenu)} className="inline-flex h-10 items-center gap-2 rounded-full border border-blue-100 bg-white px-4 text-sm font-semibold text-blue-600 hover:bg-blue-50" title="Share article" aria-expanded={showShareMenu}>
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Share
              </button>
              {showShareMenu && (
                <div className="absolute right-0 top-12 z-10 min-w-44 rounded-[16px] border border-slate-200 bg-white shadow-lg">
                  <button type="button" onClick={() => handleShare('twitter')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-[14px]">Share on X</button>
                  <button type="button" onClick={() => handleShare('facebook')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on Facebook</button>
                  <button type="button" onClick={() => handleShare('linkedin')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">Share on LinkedIn</button>
                  <button type="button" onClick={() => handleShare('email')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5" aria-hidden="true" />Email</span></button>
                  <button type="button" onClick={() => handleShare('copy')} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-[14px]">Copy link</button>
                </div>
              )}
            </div>
          </div>

          <h1 className="medium-article-title mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">{blog.title}</h1>
          {blog.excerpt && <p className="medium-article-deck">{blog.excerpt}</p>}
          {blog.location && <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500"><MapPin className="h-4 w-4" aria-hidden="true" />{blog.location}</p>}

          <div className="medium-article-byline mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-b border-slate-200 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="medium-article-author-avatar" aria-hidden="true">
                {blog.info_users?.profile_image_url
                  ? <Image src={blog.info_users.profile_image_url} alt="" width={56} height={56} unoptimized={!canOptimizeImage(blog.info_users.profile_image_url)} />
                  : blogAuthorName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">By {blogAuthorName}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Posted {formatDate(blog.published_at || blog.created_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{calculateReadTime(blog.content)} min read</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Article engagement totals">
                {engagementCounts ? (
                  <>
                    <span className="inline-flex items-center gap-1.5" aria-label={`${engagementCounts.hearts.toLocaleString()} hearts`}>
                      <Heart className="h-4 w-4 text-rose-500" aria-hidden="true" />
                      {engagementCounts.hearts.toLocaleString()} hearts
                    </span>
                    <span className="inline-flex items-center gap-1.5" aria-label={`${engagementCounts.saves.toLocaleString()} saves`}>
                      <Bookmark className="h-4 w-4 text-sky-600" aria-hidden="true" />
                      {engagementCounts.saves.toLocaleString()} saves
                    </span>
                    <span className="inline-flex items-center gap-1.5" aria-label={`${engagementCounts.views.toLocaleString()} views`}>
                      <Eye className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      {engagementCounts.views.toLocaleString()} views
                    </span>
                    <span className="inline-flex items-center gap-1.5" aria-label={`${engagementCounts.comments.toLocaleString()} comments`}>
                      <MessageSquare className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      {engagementCounts.comments.toLocaleString()} comments
                    </span>
                  </>
                ) : (
                  engagementError ? (
                    <span role="status" className="text-xs text-slate-500">{engagementError}</span>
                  ) : (
                    <span role="status" className="inline-flex items-center gap-2">
                      <span className="sr-only">Loading engagement totals</span>
                      <span aria-hidden="true" className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
                      <span aria-hidden="true" className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
                    </span>
                  )
                )}
              </div>
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
                dangerouslySetInnerHTML={{ __html: addContentHeadingIds(sanitizeRichText(blog.content)).replace(/\n/g, '<br />') }}
              />
            )}
          </div>

        </article>

        <section className="medium-article-recommendations" aria-label="More stories">
          {editorialError ? (
            <div className="medium-article-editorial-error" role="status">
              <p>{editorialError}</p>
              <button type="button" onClick={() => setEditorialReloadKey((key) => key + 1)}>Try again</button>
            </div>
          ) : editorialLoading ? (
            <div className="medium-article-recommendation-section" role="status">
              <span className="sr-only">Loading more stories</span>
              <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2">
                {[1, 2].map((item) => (
                  <div key={item} className="flex animate-pulse gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="h-24 w-24 shrink-0 rounded-xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/3 rounded-full bg-slate-200" />
                      <div className="h-4 w-full rounded-full bg-slate-200" />
                      <div className="h-3 w-4/5 rounded-full bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                  <h2>Popular on Connect Daet</h2>
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