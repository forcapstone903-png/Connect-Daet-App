'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ArrowLeft } from 'lucide-react'
import { getStoredSession } from '@/lib/authCookies'
import QuoteRepostCard from '@/app/components/user/QuoteRepostCard'

export default function ProfileArchivePage() {
  const [session] = useState(() => {
    try {
      const raw = getStoredSession()
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [reposts, setReposts] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const loadArchive = useCallback(async () => {
    if (!session?.user_id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/users/${session.user_id}?archived=true`, { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load archive.')
      setReposts(result.content?.archived_reposts || [])
      setPosts(result.content?.archived_user_posts || [])
    } catch (error) {
      setNotice(error.message || 'Unable to load archive.')
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadArchive() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadArchive])

  const restore = async (repost) => {
    const response = await fetch(`/api/reposts/${repost.repost_id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      setNotice(result.message || 'Unable to restore repost.')
      return
    }
    setReposts((previous) => previous.filter((item) => item.repost_id !== repost.repost_id))
    window.dispatchEvent(new CustomEvent('daet-repost-visibility-changed', { detail: { action: 'restored', repost } }))
  }

  const remove = async (repost) => {
    if (!window.confirm('Delete repost?\n\nThis will permanently remove your repost.')) return
    const response = await fetch(`/api/reposts/${repost.repost_id}`, { method: 'DELETE', credentials: 'same-origin' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) {
      setNotice(result.message || 'Unable to delete repost.')
      return
    }
    setReposts((previous) => previous.filter((item) => item.repost_id !== repost.repost_id))
  }

  const restorePost = async (post) => {
    const response = await fetch(`/api/posts/${post.id}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) return setNotice(result.message || 'Unable to restore post.')
    setPosts((previous) => previous.filter((item) => item.id !== post.id))
  }

  const removePost = async (post) => {
    if (!window.confirm('Delete post?\n\nThis will permanently remove your post.')) return
    const response = await fetch(`/api/posts/${post.id}`, { method: 'DELETE', credentials: 'same-origin' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) return setNotice(result.message || 'Unable to delete post.')
    setPosts((previous) => previous.filter((item) => item.id !== post.id))
  }

  if (!session?.user_id) return <main className="p-6 text-sm text-slate-600">Please sign in to view your archive.</main>

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-5">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
          <Link href="/user/profile" aria-label="Back to profile" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Profile</p><h1 className="text-xl font-black">Archive</h1></div>
        </header>
        {notice && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}
        {loading ? <div className="rounded-xl bg-white p-6 text-sm text-slate-500">Loading archive...</div> : (reposts.length || posts.length) ? <div className="space-y-4">
          {posts.map((post) => <article key={`post-${post.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">{post.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{post.content}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void restorePost(post)} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Restore</button><button type="button" onClick={() => void removePost(post)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50">Delete</button></div></div></article>)}
          {reposts.map((repost) => <article key={repost.repost_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><QuoteRepostCard item={repost} reposter={resultProfile(repost, session)} reposterName={session.full_name || session.user_name || 'You'} userId={session.user_id} onRestore={() => void restore(repost)} onDelete={() => void remove(repost)} /></article>)}
        </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><Archive className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">Archive is empty</p></div>}
      </div>
    </main>
  )
}

function resultProfile(repost, session) {
  return { id: session.user_id, full_name: session.full_name || session.user_name || 'You', profile_image_url: session.profile_image_url || null }
}
