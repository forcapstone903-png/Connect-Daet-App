'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Repeat2, Search, ThumbsUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AdminSidebar from '@/app/components/AdminSidebar'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

const TYPE_STYLES = {
  reaction: 'bg-violet-50 text-violet-700',
  share: 'bg-emerald-50 text-emerald-700',
  repost: 'bg-sky-50 text-sky-700',
  comment: 'bg-amber-50 text-amber-700',
}

const TYPE_LABELS = {
  reaction: 'Reaction',
  share: 'Share',
  repost: 'Repost',
  comment: 'Comment',
}

function formatDate(value) {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function normalizeRows({ reactions = [], shares = [], reposts = [], comments = [] }, users) {
  const userMap = new Map((users || []).map((user) => [user.id, user]))
  const actor = (userId) => userMap.get(userId) || {}

  return [
    ...reactions.map((row) => ({
      id: `reaction-${row.id}`,
      type: 'reaction',
      actor: actor(row.user_id),
      contentType: row.content_type,
      contentId: row.content_id,
      detail: `${row.reaction_type || 'like'} reaction`,
      createdAt: row.created_at,
    })),
    ...shares.map((row) => ({
      id: `share-${row.id}`,
      type: row.share_type === 'repost' ? 'repost' : 'share',
      actor: actor(row.user_id),
      contentType: row.content_type,
      contentId: row.content_id,
      detail: row.caption || row.platform || row.share_type || 'Shared content',
      createdAt: row.created_at,
    })),
    ...reposts.map((row) => ({
      id: `repost-${row.id}`,
      type: 'repost',
      actor: actor(row.user_id),
      contentType: row.original_content_type,
      contentId: row.original_content_id,
      detail: row.quote_text || 'Reposted content',
      createdAt: row.created_at,
    })),
    ...comments.map((row) => ({
      id: `comment-${row.id}`,
      type: 'comment',
      actor: actor(row.user_id),
      contentType: row.content_type,
      contentId: row.content_id,
      detail: row.body || 'Commented on content',
      createdAt: row.created_at,
    })),
  ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
}

export default function AdminEngagementPage() {
  const router = useRouter()
  const [adminUser, setAdminUser] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [error, setError] = useState('')

  const loadEngagement = useCallback(async () => {
    setError('')
    try {
      const [reactionsResult, sharesResult, repostsResult, commentsResult] = await Promise.all([
        supabase.from('content_reactions').select('id, user_id, content_type, content_id, reaction_type, created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('content_shares').select('id, user_id, content_type, content_id, share_type, caption, platform, created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('reposts').select('id, user_id, original_content_type, original_content_id, quote_text, created_at').order('created_at', { ascending: false }).limit(1000),
        supabase.from('content_comments').select('id, user_id, content_type, content_id, body, created_at').order('created_at', { ascending: false }).limit(1000),
      ])

      const failed = [reactionsResult, sharesResult, repostsResult, commentsResult].find((result) => result.error)
      if (failed?.error) throw failed.error

      const userIds = [...new Set([
        ...(reactionsResult.data || []).map((row) => row.user_id),
        ...(sharesResult.data || []).map((row) => row.user_id),
        ...(repostsResult.data || []).map((row) => row.user_id),
        ...(commentsResult.data || []).map((row) => row.user_id),
      ].filter(Boolean))]
      const usersResult = userIds.length
        ? await supabase.from('info_users').select('id, full_name, email, profile_image_url').in('id', userIds)
        : { data: [] }

      setRows(normalizeRows({
        reactions: reactionsResult.data,
        shares: sharesResult.data,
        reposts: repostsResult.data,
        comments: commentsResult.data,
      }, usersResult.data))
    } catch (loadError) {
      console.error('Engagement load failed:', loadError)
      setError('Engagement records could not be loaded. Check admin database permissions.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const session = getStoredSession()
    if (!session) {
      router.push('/login')
      return
    }

    try {
      const user = JSON.parse(session)
      if (!hasAdminAccess(user.role)) {
        router.push('/dashboard')
        return
      }
      setAdminUser(user)
      loadEngagement()
    } catch (authError) {
      console.error('Engagement auth failed:', authError)
      router.push('/login')
    }
  }, [loadEngagement, router])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const actorName = row.actor.full_name || row.actor.email || 'Unknown user'
      const haystack = [actorName, row.actor.email, row.type, row.contentType, row.contentId, row.detail].filter(Boolean).join(' ').toLowerCase()
      return (typeFilter === 'all' || row.type === typeFilter) && (!query || haystack.includes(query))
    })
  }, [rows, search, typeFilter])

  const counts = useMemo(() => ({
    total: rows.length,
    reactions: rows.filter((row) => row.type === 'reaction').length,
    shares: rows.filter((row) => row.type === 'share' || row.type === 'repost').length,
    comments: rows.filter((row) => row.type === 'comment').length,
  }), [rows])

  if (!adminUser) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Loading engagement...</div>

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AdminSidebar user={adminUser} roleLabel="Administrator" userRole={adminUser.role} />
      <main className="min-w-0 flex-1 overflow-auto" style={{ marginLeft: 'var(--admin-sidebar-width)' }}>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Community</p><h1 className="mt-1 text-3xl font-black text-slate-950">Engagement activity</h1><p className="mt-2 text-sm text-slate-600">Review every reaction, share, repost, and comment recorded by the platform.</p></div>
            <button type="button" onClick={loadEngagement} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Refresh records</button>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[['Total activity', counts.total, 'bg-slate-950'], ['Reactions', counts.reactions, 'bg-violet-600'], ['Shares & reposts', counts.shares, 'bg-emerald-600'], ['Comments', counts.comments, 'bg-amber-500']].map(([label, value, color]) => <div key={label} className="border border-slate-200 bg-white p-4 shadow-sm"><div className={`mb-3 h-1.5 w-12 ${color}`} /><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>)}
          </div>

          <section className="border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <label className="flex min-w-0 flex-1 items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 sm:max-w-md"><Search className="h-4 w-4 shrink-0" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, post, type, or content" className="w-full bg-transparent outline-none" /></label>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"><option value="all">All activity</option><option value="reaction">Reactions</option><option value="share">Shares</option><option value="repost">Reposts</option><option value="comment">Comments</option></select>
            </div>

            {error && <div className="m-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {loading ? <div className="p-8 text-center text-sm text-slate-500">Loading engagement records...</div> : filteredRows.length ? <div className="overflow-x-auto"><table className="min-w-[860px] w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-5 py-3 font-bold">Activity</th><th className="px-5 py-3 font-bold">User</th><th className="px-5 py-3 font-bold">Content</th><th className="px-5 py-3 font-bold">Details</th><th className="px-5 py-3 font-bold">Recorded</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredRows.map((row) => { const Icon = row.type === 'reaction' ? ThumbsUp : row.type === 'comment' ? MessageCircle : Repeat2; return <tr key={row.id} className="align-top hover:bg-slate-50"><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold ${TYPE_STYLES[row.type]}`}><Icon className="h-3.5 w-3.5" />{TYPE_LABELS[row.type]}</span></td><td className="px-5 py-4"><p className="font-semibold text-slate-800">{row.actor.full_name || 'Unknown user'}</p><p className="mt-1 text-xs text-slate-500">{row.actor.email || row.actor.id || 'No email'}</p></td><td className="px-5 py-4"><p className="font-semibold text-slate-800">{row.contentType}</p><p className="mt-1 max-w-[190px] truncate font-mono text-[11px] text-slate-500" title={row.contentId}>{row.contentId}</p></td><td className="max-w-[280px] px-5 py-4 text-slate-600"><p className="line-clamp-2">{row.detail}</p></td><td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDate(row.createdAt)}</td></tr> })}</tbody></table></div> : <div className="p-10 text-center text-sm text-slate-500">No engagement records match your filters.</div>}
            <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">Showing {filteredRows.length} of {rows.length} records</div>
          </section>
        </div>
      </main>
    </div>
  )
}
