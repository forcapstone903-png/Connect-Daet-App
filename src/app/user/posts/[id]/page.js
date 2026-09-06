'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function UserPostDetailPage() {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [postId, setPostId] = useState('')

  useEffect(() => {
    const id = window.location.pathname.split('/').filter(Boolean).pop()
    setPostId(id || '')
    if (!id) {
      setError('Post not found.')
      setLoading(false)
      return
    }

    const loadPost = async () => {
      const { data, error: loadError } = await supabase
        .from('info_user_posts')
        .select('id, user_id, title, content, status, created_at, updated_at, info_users(full_name, email, profile_image_url)')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle()

      if (loadError || !data) setError('Post not found.')
      else setPost(data)
      setLoading(false)
    }

    void loadPost()
  }, [])

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><Loader className="h-5 w-5 animate-spin text-sky-600" /></main>
  if (error) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center"><p className="text-sm text-slate-600">{error}</p><Link href="/user/dashboard" className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Back to dashboard</Link></div></main>

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-5">
      <article className="mx-auto max-w-3xl">
        <Link href={post?.user_id ? `/user/profile/${post.user_id}` : '/user/dashboard'} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-sky-700"><ArrowLeft className="h-4 w-4" />Back to profile</Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3 text-sm text-slate-500"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sky-700">{post.info_users?.profile_image_url ? <img src={post.info_users.profile_image_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-4 w-4" />}</div><span>{post.info_users?.full_name || post.info_users?.email || 'Community member'}</span><span>·</span><time>{new Date(post.created_at).toLocaleDateString()}</time></div>
          <h1 className="mt-5 text-2xl font-black text-slate-900 sm:text-3xl">{post.title}</h1>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p>
        </div>
      </article>
    </main>
  )
}
