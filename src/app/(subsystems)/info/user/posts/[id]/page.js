'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Clock3, FileText, Loader, MessageCircle, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Comments from '@/app/(subsystems)/info/components/user/Comments'
import { isImageAttachment, parsePostContent } from '@/lib/postContent'

export default function UserPostDetailPage() {
  const params = useParams()
  const postId = typeof params.id === 'string' ? params.id : ''
  const [postResult, setPostResult] = useState({ postId: '', post: null, error: '' })
  const [userId, setUserId] = useState(null)
  const currentPostResult = postResult.postId === postId ? postResult : null
  const post = currentPostResult?.post || null
  const loading = Boolean(postId) && !currentPostResult
  const error = !postId ? 'Post not found.' : currentPostResult?.error || ''

  useEffect(() => {
    let active = true
    if (!postId) return () => { active = false }

    const loadPost = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!active) return
        setUserId(sessionData?.session?.user?.id || null)

        const { data, error: loadError } = await supabase
          .from('info_user_posts')
          .select('id, user_id, title, content, status, created_at, updated_at, info_users(full_name, profile_image_url)')
          .eq('id', postId)
          .eq('status', 'published')
          .maybeSingle()

        if (!active) return
        if (loadError) {
          console.error('User post detail lookup failed:', loadError)
          setPostResult({ postId, post: null, error: 'Unable to load this post right now. Please try again.' })
        } else if (!data) {
          setPostResult({ postId, post: null, error: 'This post is no longer available.' })
        } else {
          setPostResult({ postId, post: data, error: '' })
        }
      } catch (loadError) {
        console.error('User post detail request failed:', loadError)
        if (active) setPostResult({ postId, post: null, error: 'Unable to load this post right now. Please try again.' })
      }
    }

    void loadPost()
    return () => {
      active = false
    }
  }, [postId])

  if (loading) return (
    <main className="tourism-shell usr-section-page usr-detail flex min-h-screen items-center justify-center p-6">
      <div className="usr-card usr-pop-in p-6 text-center">
        <Loader className="usr-spin mx-auto mb-3 h-6 w-6 text-teal-700" />
        <p className="text-sm font-semibold text-slate-600">Loading this post...</p>
      </div>
    </main>
  )
  if (error) return (
    <main className="tourism-shell usr-section-page usr-detail flex min-h-screen items-center justify-center p-6">
      <div className="usr-empty-state max-w-xl">
        <p className="text-sm font-semibold text-slate-600">{error}</p>
        <Link href="/info/user/dashboard" className="usr-section-primary mt-5 inline-flex">Back to dashboard</Link>
      </div>
    </main>
  )

  const postContent = parsePostContent(post.content)
  const postTitle = post.title?.trim() || 'Community post'
  const postCreatedAt = post.created_at ? new Date(post.created_at) : null
  const postUpdatedAt = post.updated_at ? new Date(post.updated_at) : null
  const validCreatedAt = postCreatedAt && !Number.isNaN(postCreatedAt.getTime())
  const validUpdatedAt = postUpdatedAt && !Number.isNaN(postUpdatedAt.getTime())
  const wasUpdated = validCreatedAt && validUpdatedAt
    && postUpdatedAt.getTime() - postCreatedAt.getTime() > 60_000

  return (
    <main className="tourism-shell usr-section-page usr-detail min-h-screen px-4 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="usr-section-container mx-auto max-w-7xl pb-10 pt-0">
        <nav className="mb-5 flex flex-wrap items-center justify-between gap-3" aria-label="Post navigation">
          <Link
            href="/info/user/dashboard"
            className="usr-section-secondary inline-flex items-center gap-2 text-sm font-bold shadow-sm hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to feed
          </Link>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Community / Post</span>
        </nav>

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:gap-7">
          <article className="usr-card usr-enter min-w-0 overflow-hidden">
            <header className="bg-sky-50 px-5 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/90 px-3 py-1.5 text-xs font-bold text-sky-800">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Community post
                </span>
                <a
                  href="#post-comments"
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-sky-800"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Join the conversation
                </a>
              </div>

              <h1 className="mt-5 break-words text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                {postTitle}
              </h1>

              <div className="mt-6 flex min-w-0 items-center gap-3 border-t border-sky-100 pt-5">
                <Link
                  href={post.user_id ? `/info/user/profile/${post.user_id}` : '/info/user/profile'}
                  aria-label="View author's profile"
                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-sky-100 text-sky-700 shadow-sm"
                >
                  {post.info_users?.profile_image_url
                    ? <img src={post.info_users.profile_image_url} alt="" className="h-full w-full object-cover" />
                    : <UserRound className="h-5 w-5" aria-hidden="true" />}
                </Link>
                <div className="min-w-0">
                  <Link
                    href={post.user_id ? `/info/user/profile/${post.user_id}` : '/info/user/profile'}
                    className="block truncate text-sm font-bold text-slate-900 hover:text-sky-700"
                  >
                    {post.info_users?.full_name || post.info_users?.email || 'Community member'}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      <time dateTime={post.created_at || undefined}>
                        {validCreatedAt ? postCreatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'}
                      </time>
                    </span>
                    {wasUpdated && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edited {postUpdatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </header>

            <div className="border-t border-slate-100 px-5 py-6 sm:px-8 sm:py-8">
              {postContent.text && (
                <p className="usr-reading-body whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700 sm:text-base">
                  {postContent.text}
                </p>
              )}

              {postContent.attachments.length > 0 && (
                <section className={postContent.text ? 'mt-8 border-t border-slate-100 pt-6' : ''} aria-label="Post attachments">
                  <h2 className="mb-4 text-sm font-bold text-slate-800">
                    Attachments <span className="ml-1 text-slate-400">({postContent.attachments.length})</span>
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {postContent.attachments.map((url, index) => (
                      <a
                        key={`${url}-${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 transition hover:border-sky-300 hover:shadow-md"
                        aria-label={`Open attachment ${index + 1}`}
                      >
                        {isImageAttachment(url)
                          ? <img src={url} alt={`Attachment ${index + 1}`} loading="lazy" className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                          : <span className="flex aspect-video items-center justify-center gap-2 p-4 text-sm font-semibold text-sky-700"><FileText className="h-5 w-5" aria-hidden="true" />Open attachment {index + 1}</span>}
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </article>

          <aside id="post-comments" className="min-w-0 scroll-mt-6 lg:sticky lg:top-6">
            <Comments
              contentType="user_post"
              contentId={post.id}
              userId={userId}
              contentOwnerId={post.user_id}
              contentTitle={postTitle}
              articleStyle
            />
          </aside>
        </div>
      </div>
    </main>
  )
}
