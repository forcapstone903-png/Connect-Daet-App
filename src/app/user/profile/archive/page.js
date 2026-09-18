'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive } from 'lucide-react'
import { getStoredSession } from '@/lib/authCookies'
import QuoteRepostCard from '@/app/components/user/QuoteRepostCard'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import UserTopHeader from '@/app/components/user/UserTopHeader'

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

  if (!session?.user_id) return <main className="tourism-shell usr-section-page usr-profile flex min-h-screen items-center justify-center p-6 text-sm font-semibold text-slate-600">Please sign in to view your archive.</main>

  return (
    <main className="tourism-shell usr-section-page usr-profile min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-3xl px-3 pb-24 pt-2 sm:px-5 lg:px-6">
        <UserSectionHeader
          eyebrow="Content vault"
          title="Archive"
          description="Posts and reposts you hid from your profile stay here. Restore them anytime."
          emoji="🗂️"
          backHref="/user/profile"
          backLabel="Your profile"
        >
          <span className="usr-section-counter">{reposts.length + posts.length} archived</span>
        </UserSectionHeader>

        {notice && <p role="status" className="usr-inline-note usr-inline-note-error mb-4">{notice}</p>}

        {loading ? (
          <div className="usr-section-loading">
            {[0, 1].map((item) => (
              <div key={item} className="usr-card space-y-3 p-5">
                <div className="usr-section-skeleton h-3 w-1/3 rounded-full" />
                <div className="usr-section-skeleton h-3 w-4/5 rounded-full" />
              </div>
            ))}
          </div>
        ) : (reposts.length || posts.length) ? (
          <div className="usr-stagger space-y-4">
            {posts.map((post) => (
              <article key={`post-${post.id}`} className="usr-card p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Post</p>
                    <h2 className="mt-1 font-bold text-slate-900">{post.title}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{post.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => void restorePost(post)} className="usr-section-secondary !min-h-[36px] !px-3 !py-1.5 !text-[11px]">Restore</button>
                    <button type="button" onClick={() => void removePost(post)} className="usr-press inline-flex min-h-[36px] items-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100">Delete</button>
                  </div>
                </div>
              </article>
            ))}
            {reposts.map((repost) => (
              <article key={repost.repost_id} className="usr-card p-4 sm:p-5">
                <QuoteRepostCard item={repost} reposter={resultProfile(repost, session)} reposterName={session.full_name || session.user_name || 'You'} userId={session.user_id} onRestore={() => void restore(repost)} onDelete={() => void remove(repost)} />
              </article>
            ))}
          </div>
        ) : (
          <div className="usr-empty-state usr-pop-in">
            <Archive className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">Your archive is empty</p>
            <p className="mt-1 text-xs text-slate-500">Archived posts and reposts will be listed here so you can restore them.</p>
            <Link href="/user/profile" className="usr-section-secondary mt-5 inline-flex">Back to profile</Link>
          </div>
        )}
      </div>
    </main>
  )
}

function resultProfile(repost, session) {
  return { id: session.user_id, full_name: session.full_name || session.user_name || 'You', profile_image_url: session.profile_image_url || null }
}
