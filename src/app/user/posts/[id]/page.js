'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Comments from '@/app/components/user/Comments'

export default function UserPostDetailPage() {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [postId, setPostId] = useState('')
  const [userId, setUserId] = useState(null)

  useEffect(() => {
    const id = window.location.pathname.split('/').filter(Boolean).pop()
    setPostId(id || '')
    if (!id) {
      setError('Post not found.')
      setLoading(false)
      return
    }

    const loadPost = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      setUserId(sessionData?.session?.user?.id || null)

      const { data, error: loadError } = await supabase
        .from('info_user_posts')
        .select('id, user_id, title, content, status, created_at, updated_at, info_users(full_name, email, profile_image_url)')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle()

      if (loadError || !data) setError('This post is no longer available.')
      else setPost(data)
      setLoading(false)
    }

    void loadPost()
  }, [])

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
        <Link href="/user/dashboard" className="usr-section-primary mt-5 inline-flex">Back to dashboard</Link>
      </div>
    </main>
  )

  return (
    <main className="tourism-shell usr-section-page usr-detail min-h-screen px-3 py-6 text-slate-900 sm:px-5">
      <div className="usr-section-container mx-auto max-w-6xl pb-8 pt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start lg:gap-6">
      <article className="max-w-3xl">
        <div className="usr-card usr-enter p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <Link href={post.user_id ? `/user/profile/${post.user_id}` : '/user/profile'} aria-label="View author's profile" className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-teal-50 text-teal-700">
              {post.info_users?.profile_image_url ? <img src={post.info_users.profile_image_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4" />}
            </Link>
            <Link href={post.user_id ? `/user/profile/${post.user_id}` : '/user/profile'} className="font-bold text-slate-800 hover:text-teal-700">{post.info_users?.full_name || post.info_users?.email || 'Community member'}</Link>
            <span aria-hidden="true">·</span>
            <time dateTime={post.created_at || undefined}>{new Date(post.created_at).toLocaleDateString()}</time>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Community post</span>
          </div>
          <h1 className="mt-5 text-2xl font-black text-slate-900 sm:text-3xl">{post.title}</h1>
          <p className="usr-reading-body mt-5 whitespace-pre-wrap text-slate-700">{post.content}</p>
        </div>
      </article>
      <aside className="mt-6 lg:sticky lg:top-6 lg:mt-0 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1">
        <Comments contentType="user_post" contentId={post.id} userId={userId} contentOwnerId={post.user_id} contentTitle={post.title} />
      </aside>
      </div>
    </main>
  )
}
