'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  History,
  LayoutGrid,
  List,
  MessageSquareText,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  AdminBadge,
  AdminEmptyState,
  AdminPanel,
  AdminSearch,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
  AdminTable,
  AdminTableFooter,
  AdminToolbar,
} from '@/app/(subsystems)/info/components/admin'

const TABS = [
  { id: 'all', label: 'All posts' },
  { id: 'pending', label: 'Pending approvals' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'changes_requested', label: 'Changes requested' },
]

const EMPTY_STATS = {
  totalPosts: 0,
  pendingApprovals: 0,
  approvedPosts: 0,
  rejectedPosts: 0,
  changesRequested: 0,
  reportedPosts: 0,
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function plainText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function authorName(author) {
  return author?.full_name || author?.email || 'Unknown author'
}

function statusClass(status) {
  if (status === 'approved') return 'border-green-200 bg-green-50 text-green-700'
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700'
  if (status === 'changes_requested') return 'border-blue-200 bg-blue-50 text-blue-700'
  if (status === 'draft') return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function statusLabel(status) {
  return status === 'changes_requested' ? 'Changes requested' : String(status || 'pending').replace(/_/g, ' ')
}

export default function AdminBlogsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" aria-label="Loading blog management" />}>
      <AdminBlogsContent />
    </Suspense>
  )
}

function AdminBlogsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedStatus = searchParams.get('status')
  const status = TABS.some((tab) => tab.id === requestedStatus) ? requestedStatus : 'pending'
  const [view, setView] = useState('posts')
  const [layout, setLayout] = useState('board')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [author, setAuthor] = useState('')
  const [submittedFrom, setSubmittedFrom] = useState('')
  const [submittedTo, setSubmittedTo] = useState('')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [posts, setPosts] = useState([])
  const [history, setHistory] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 })
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState('')
  const [error, setError] = useState('')
  const [selectedPost, setSelectedPost] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [decisionDialog, setDecisionDialog] = useState(null)
  const [moderationFeedback, setModerationFeedback] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [editPost, setEditPost] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', excerpt: '', content: '', category: '', featured_image: '' })
  const [deletePost, setDeletePost] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({
      page: String(page),
      pageSize: view === 'history' ? '25' : layout === 'board' ? '50' : '10',
      ...(view === 'history' ? { view: 'history' } : { status, direction }),
    })
    if (view === 'posts' && search.trim()) params.set('search', search.trim())
    if (view === 'posts' && category) params.set('category', category)
    if (view === 'posts' && author.trim()) params.set('author', author.trim())
    if (view === 'posts' && submittedFrom) params.set('submittedFrom', submittedFrom)
    if (view === 'posts' && submittedTo) params.set('submittedTo', submittedTo)

    try {
      const response = await fetch(`/info/api/admin/blogs?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load blog moderation data.')
      }

      setStats(result.stats || EMPTY_STATS)
      setPagination(result.pagination || { page: 1, pages: 0, total: 0 })
      if (view === 'history') setHistory(result.history || [])
      else setPosts(result.posts || [])
      return true
    } catch (loadError) {
      console.error('Blog moderation data load failed:', loadError)
      setError(loadError.message || 'Unable to load blog moderation data.')
      setPosts([])
      setHistory([])
      return false
    } finally {
      setLoading(false)
    }
  }, [author, category, direction, layout, page, search, status, submittedFrom, submittedTo, view])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadData, search])

  const categories = useMemo(() => (
    [...new Set(posts.map((post) => post.category).filter(Boolean))].sort()
  ), [posts])

  const openDecision = (post, decision) => {
    setDecisionDialog({ post, decision, posts: null })
    setModerationFeedback('')
    setReasonError('')
    setError('')
  }

  const openBulkDecision = (decision) => {
    const selected = posts.filter((post) => selectedIds.includes(post.id) && post.approval_status === 'pending')
    if (!selected.length) return
    setDecisionDialog({ post: null, decision, posts: selected })
    setModerationFeedback('')
    setReasonError('')
    setError('')
  }

  const moderatePost = async () => {
    if (!decisionDialog) return
    const needsFeedback = ['reject', 'request_changes'].includes(decisionDialog.decision)
    if (needsFeedback && !moderationFeedback.trim()) {
      setReasonError('Add feedback so the author knows what to address.')
      return
    }
    if (moderationFeedback.trim().length > 1000) {
      setReasonError('Keep the feedback under 1,000 characters.')
      return
    }
    const targets = decisionDialog.posts || [decisionDialog.post]
    const failed = []
    const succeeded = []
    setActionId(decisionDialog.posts ? 'bulk' : decisionDialog.post.id)
    setError('')
    setReasonError('')
    try {
      for (const post of targets) {
        try {
          const response = await fetch(`/info/api/admin/blogs/${post.id}`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: decisionDialog.decision, reason: moderationFeedback.trim() }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save the moderation decision.')
          }
          succeeded.push(post)
        } catch (moderationError) {
          failed.push({ post, message: moderationError.message || 'Unable to save the moderation decision.' })
        }
      }
      if (succeeded.length) {
        const successfulIds = new Set(succeeded.map((post) => post.id))
        setSelectedIds((current) => current.filter((id) => !successfulIds.has(id)))
        setSelectedPost(null)
      }
      const refreshed = await loadData()
      if (failed.length) {
        const failedPosts = failed.map((item) => item.post)
        setDecisionDialog((current) => current ? { ...current, posts: current.posts ? failedPosts : null, post: current.posts ? null : failedPosts[0] } : null)
        setError(`${succeeded.length} saved; ${failed.length} failed. ${failed.map((item) => `${item.post.title || 'Untitled post'}: ${item.message}`).join(' ')}${refreshed ? '' : ' The list could not be refreshed.'}`)
      } else {
        setDecisionDialog(null)
        setModerationFeedback('')
        setError(refreshed ? '' : 'The moderation decision was saved, but the list could not be refreshed.')
      }
    } catch (moderationError) {
      console.error('Blog moderation action failed:', moderationError)
      setError(moderationError.message || 'Unable to save the moderation decision.')
    } finally {
      setActionId('')
    }
  }

  const handleDecision = (event) => {
    event.preventDefault()
    void moderatePost()
  }

  const openEdit = (post) => {
    setEditPost(post)
    setEditForm({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      category: post.category || '',
      featured_image: post.featured_image || '',
    })
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    if (!editPost) return
    setActionId(editPost.id)
    setError('')
    try {
      const response = await fetch(`/info/api/admin/blogs/${editPost.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save the blog post.')
      setEditPost(null)
      setSelectedPost((current) => current?.id === editPost.id ? { ...current, ...result.blog } : current)
      const refreshed = await loadData()
      if (!refreshed) setError('The blog post was saved, but the list could not be refreshed.')
    } catch (saveError) {
      console.error('Admin blog edit failed:', saveError)
      setError(saveError.message || 'Unable to save the blog post.')
    } finally {
      setActionId('')
    }
  }

  const confirmDelete = async () => {
    if (!deletePost) return
    const target = deletePost
    setActionId(target.id)
    setError('')
    try {
      const response = await fetch(`/info/api/admin/blogs/${target.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete the blog post.')
      setDeletePost(null)
      setSelectedPost((current) => current?.id === target.id ? null : current)
      const refreshed = await loadData()
      if (!refreshed) setError('The blog post was deleted, but the list could not be refreshed.')
    } catch (deleteError) {
      console.error('Admin blog deletion failed:', deleteError)
      setError(deleteError.message || 'Unable to delete the blog post.')
    } finally {
      setActionId('')
    }
  }

  const renderModerationActions = (post, compact = false) => {
    const buttonClass = compact
      ? 'inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold disabled:opacity-50'
      : 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50'
    const busy = Boolean(actionId)
    const state = post.approval_status
    return (
      <>
        {state === 'pending' ? (
          <>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'approve')} className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700`}><ShieldCheck className="h-3.5 w-3.5" />Approve</button>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'reject')} className={`${buttonClass} border border-red-200 text-red-700 hover:bg-red-50`}><X className="h-3.5 w-3.5" />Reject</button>
          </>
        ) : null}
        {state === 'approved' ? (
          <>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'return_to_pending')} className={`${buttonClass} border border-amber-200 text-amber-800 hover:bg-amber-50`}><RotateCcw className="h-3.5 w-3.5" />Unpublish</button>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'reject')} className={`${buttonClass} border border-red-200 text-red-700 hover:bg-red-50`}><X className="h-3.5 w-3.5" />Reject</button>
          </>
        ) : null}
        {['rejected', 'changes_requested'].includes(state) ? (
          <>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'return_to_pending')} className={`${buttonClass} border border-amber-200 text-amber-800 hover:bg-amber-50`}><RotateCcw className="h-3.5 w-3.5" />Return to pending</button>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'approve')} className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700`}><ShieldCheck className="h-3.5 w-3.5" />Approve</button>
          </>
        ) : null}
      </>
    )
  }

  const renderPostManagementActions = (post, compact = false) => {
    const buttonClass = compact
      ? 'inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
    return (
      <>
        <button type="button" onClick={() => selectPost(post)} className={buttonClass}><Eye className="h-3.5 w-3.5" />Preview</button>
        <button type="button" disabled={Boolean(actionId)} onClick={() => openEdit(post)} className={`${buttonClass} disabled:opacity-50`}><Pencil className="h-3.5 w-3.5" />Edit</button>
        {renderModerationActions(post, compact)}
        <button type="button" disabled={Boolean(actionId)} onClick={() => setDeletePost(post)} className={`${buttonClass} border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50`}><Trash2 className="h-3.5 w-3.5" />Delete</button>
      </>
    )
  }

  const changeTab = (nextStatus) => {
    setPage(1)
    setView('posts')
    setSelectedIds([])
    setSelectedPost(null)
    router.replace(`/info/admin/blogs?status=${nextStatus}`, { scroll: false })
  }

  const changeView = (nextView) => {
    setPage(1)
    setView(nextView)
    setSelectedIds([])
  }

  const selectPost = (post) => {
    setSelectedPost(post)
    if (layout !== 'board') setLayout('board')
  }

  const renderStatus = (value) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusClass(value)}`}>
      {value === 'approved' ? <Check className="h-3.5 w-3.5" /> : value === 'rejected' ? <X className="h-3.5 w-3.5" /> : value === 'changes_requested' ? <MessageSquareText className="h-3.5 w-3.5" /> : value === 'draft' ? <BookOpenText className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
      {statusLabel(value)}
    </span>
  )

  return (
    <AdminShell
      title="Blog management"
      eyebrow="Content moderation"
      description="Review submissions before publication, track decisions, and keep public stories trustworthy."
      headerIcon="blog"
      contentClassName="pb-10"
    >
      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <AdminStatGrid columns={5}>
          <AdminStatCard label="Total posts" value={stats.totalPosts} icon="content" href="/info/admin/blogs?status=all" />
          <AdminStatCard label="Pending approvals" value={stats.pendingApprovals} icon="moderation" tone="warning" href="/info/admin/blogs?status=pending" />
          <AdminStatCard label="Approved posts" value={stats.approvedPosts} icon="blog" tone="success" href="/info/admin/blogs?status=approved" />
          <AdminStatCard label="Rejected posts" value={stats.rejectedPosts} icon="moderation" tone="danger" href="/info/admin/blogs?status=rejected" />
          <AdminStatCard label="Reported posts" value={stats.reportedPosts} icon="moderation" tone="danger" href="/info/admin/moderation" />
        </AdminStatGrid>

        <AdminPanel
          title={view === 'history' ? 'Moderation history' : 'Post submissions'}
          description={view === 'history'
            ? 'A record of administrator decisions and feedback.'
            : 'Review full submissions, give authors actionable feedback, and track moderation decisions.'}
          bodyClassName="!p-0"
          actions={(
            <button
              type="button"
              onClick={() => changeView(view === 'history' ? 'posts' : 'history')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {view === 'history' ? <BookOpenText className="h-4 w-4" /> : <History className="h-4 w-4" />}
              {view === 'history' ? 'View posts' : 'Moderation history'}
            </button>
          )}
        >
          {view === 'posts' ? (
            <>
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 pt-4 sm:px-5">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => changeTab(tab.id)}
                    className={`rounded-t-xl border-b-2 px-3 py-2 text-sm font-semibold transition ${
                      status === tab.id
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'pending' ? <span className="ml-2 text-xs text-amber-700">{stats.pendingApprovals}</span> : null}
                    {tab.id === 'changes_requested' ? <span className="ml-2 text-xs text-blue-700">{stats.changesRequested}</span> : null}
                  </button>
                ))}
              </div>

              <AdminToolbar className="border-b border-slate-100 px-4 py-3 sm:px-5">
                <AdminSearch
                  value={search}
                  onChange={(value) => { setSearch(value); setPage(1); setSelectedIds([]) }}
                  placeholder="Search post titles…"
                  label="Search blog posts"
                  className="min-w-[220px] flex-1"
                />
                <label className="sr-only" htmlFor="blog-author-filter">Filter by author name</label>
                <input
                  id="blog-author-filter"
                  value={author}
                  onChange={(event) => { setAuthor(event.target.value); setPage(1); setSelectedIds([]) }}
                  placeholder="Author"
                  className="min-h-10 w-36 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                />
                <label className="sr-only" htmlFor="blog-category-filter">Filter by category</label>
                <select
                  id="blog-category-filter"
                  value={category}
                  onChange={(event) => { setCategory(event.target.value); setPage(1); setSelectedIds([]) }}
                  className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="">All categories</option>
                  {categories.map((item) => <option key={item} value={item}>{item.replace(/[_-]/g, ' ')}</option>)}
                </select>
                <label className="sr-only" htmlFor="blog-submitted-from">Submitted from</label>
                <input id="blog-submitted-from" type="date" value={submittedFrom} onChange={(event) => { setSubmittedFrom(event.target.value); setPage(1); setSelectedIds([]) }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400" />
                <label className="sr-only" htmlFor="blog-submitted-to">Submitted to</label>
                <input id="blog-submitted-to" type="date" value={submittedTo} onChange={(event) => { setSubmittedTo(event.target.value); setPage(1); setSelectedIds([]) }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400" />
                <button
                  type="button"
                  onClick={() => { setDirection((value) => value === 'desc' ? 'asc' : 'desc'); setPage(1); setSelectedIds([]) }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label={`Sort by submission date ${direction === 'desc' ? 'ascending' : 'descending'}`}
                >
                  {direction === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  Submitted
                </button>
                <div className="ml-auto flex rounded-xl border border-slate-200 p-1" role="group" aria-label="Post display mode">
                  <button type="button" onClick={() => { setLayout('board'); setPage(1); setSelectedIds([]) }} aria-pressed={layout === 'board'} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${layout === 'board' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutGrid className="inline h-4 w-4" /><span className="sr-only">Queue view</span></button>
                  <button type="button" onClick={() => { setLayout('list'); setPage(1); setSelectedIds([]) }} aria-pressed={layout === 'list'} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${layout === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><List className="inline h-4 w-4" /><span className="sr-only">List view</span></button>
                </div>
              </AdminToolbar>

              {error ? <p role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">{error}</p> : null}

              {loading ? (
                <div className="space-y-3 p-5" aria-label="Loading blog posts">
                  {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : layout === 'board' && posts.length ? (
                <div className="grid gap-0 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
                  <section className="min-w-0 border-b border-slate-100 lg:border-b-0 lg:border-r" aria-label="Blog review queue">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{status === 'pending' ? 'Pending queue' : `${statusLabel(status)} posts`}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{pagination.total} posts · select a post to preview</p>
                      </div>
                      {status === 'pending' ? (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={posts.length > 0 && posts.every((post) => selectedIds.includes(post.id))}
                            onChange={(event) => setSelectedIds(event.target.checked ? posts.filter((post) => post.approval_status === 'pending').map((post) => post.id) : [])}
                            aria-label="Select all pending posts on this page"
                          />
                          Select all
                        </label>
                      ) : null}
                    </div>
                    {status === 'pending' && selectedIds.length ? (
                      <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-blue-50/60 px-4 py-3">
                        <span className="mr-auto self-center text-xs font-semibold text-blue-900">{selectedIds.length} selected</span>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('approve')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Approve selected</button>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('request_changes')} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50">Request changes</button>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('reject')} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">Reject selected</button>
                      </div>
                    ) : null}
                    <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">
                      {posts.map((post) => (
                        <div
                          key={post.id}
                          draggable={post.approval_status === 'pending'}
                          onDragStart={(event) => { event.dataTransfer.setData('text/plain', post.id); event.dataTransfer.effectAllowed = 'move' }}
                          className={`flex gap-3 rounded-xl border p-3 transition ${selectedPost?.id === post.id ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                        >
                          {status === 'pending' ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(post.id)}
                              onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, post.id])] : current.filter((id) => id !== post.id))}
                              aria-label={`Select ${post.title || 'Untitled post'}`}
                              className="mt-1 shrink-0"
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <button type="button" onClick={() => selectPost(post)} className="flex w-full min-w-0 gap-3 text-left">
                              {post.featured_image ? <img src={post.featured_image} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" /> : <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><BookOpenText className="h-6 w-6" /></span>}
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="truncate text-sm font-bold text-slate-900">{post.title || 'Untitled post'}</span>
                                  {renderStatus(post.approval_status)}
                                </span>
                                <span className="mt-1 block truncate text-xs text-slate-600">{post.excerpt || plainText(post.content).slice(0, 140) || 'No excerpt provided.'}</span>
                                <span className="mt-2 block truncate text-[11px] text-slate-500">{authorName(post.author)} · {formatDate(post.submitted_at || post.created_at)}</span>
                              </span>
                            </button>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2">
                              {renderModerationActions(post, true)}
                              {post.approval_status === 'pending' ? (
                                <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(post, 'request_changes')} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                                  <MessageSquareText className="h-3.5 w-3.5" />Request changes
                                </button>
                              ) : null}
                              <button type="button" disabled={Boolean(actionId)} onClick={() => openEdit(post)} aria-label={`Edit ${post.title || 'blog post'}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit</button>
                              <button type="button" disabled={Boolean(actionId)} onClick={() => setDeletePost(post)} aria-label={`Delete ${post.title || 'blog post'}`} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {status === 'pending' ? (
                      <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-3">
                        {[
                          { decision: 'approve', label: 'Approve', classes: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
                          { decision: 'request_changes', label: 'Request changes', classes: 'border-blue-200 bg-blue-50 text-blue-800' },
                          { decision: 'reject', label: 'Reject', classes: 'border-red-200 bg-red-50 text-red-800' },
                        ].map((target) => (
                          <button
                            key={target.decision}
                            type="button"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault()
                              const draggedPost = posts.find((post) => post.id === event.dataTransfer.getData('text/plain'))
                              if (draggedPost?.approval_status === 'pending') openDecision(draggedPost, target.decision)
                            }}
                            onClick={() => selectedPost?.approval_status === 'pending' && openDecision(selectedPost, target.decision)}
                            aria-label={`${target.label}; drag a pending post here or select a pending post first`}
                            className={`min-h-12 rounded-xl border border-dashed px-2 py-2 text-xs font-bold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${target.classes}`}
                          >
                            Drop or select a post to {target.label.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="min-w-0 p-4 sm:p-5" aria-label="Selected blog preview">
                    {selectedPost ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Complete post preview</p>
                            <h3 className="mt-2 text-xl font-bold text-slate-950">{selectedPost.title || 'Untitled post'}</h3>
                            <p className="mt-1 text-sm text-slate-500">{authorName(selectedPost.author)}{selectedPost.author?.email ? ` · ${selectedPost.author.email}` : ''}</p>
                          </div>
                          {renderStatus(selectedPost.approval_status)}
                        </div>
                        {selectedPost.featured_image ? <img src={selectedPost.featured_image} alt="" className="mt-4 max-h-64 w-full rounded-xl object-cover" /> : null}
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                          <span>Submitted {formatDate(selectedPost.submitted_at || selectedPost.created_at)}</span>
                          <span className="capitalize">{String(selectedPost.category || 'Uncategorized').replace(/[_-]/g, ' ')}</span>
                        </div>
                        {selectedPost.excerpt ? <p className="mt-4 border-l-2 border-blue-200 pl-3 text-sm font-medium leading-6 text-slate-700">{selectedPost.excerpt}</p> : null}
                        <div className="mt-4 max-h-[34vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{plainText(selectedPost.content)}</div>
                        {selectedPost.rejection_reason ? <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"><strong>Previous administrator feedback:</strong> {selectedPost.rejection_reason}</p> : null}
                        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                          {renderPostManagementActions(selectedPost)}
                          {selectedPost.approval_status === 'pending' ? (
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'request_changes')} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                              <MessageSquareText className="mr-1 inline h-3.5 w-3.5" />Request changes
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                        <Eye className="h-8 w-8 text-slate-300" />
                        <h3 className="mt-3 text-sm font-bold text-slate-800">Choose a submission</h3>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">The complete post and author details will appear here for review.</p>
                      </div>
                    )}
                  </section>
                </div>
              ) : posts.length ? (
                <AdminTable wrapClassName="border-0 shadow-none">
                  <thead>
                    <tr>
                      <th scope="col">Post</th>
                      <th scope="col">Author</th>
                      <th scope="col">Category</th>
                      <th scope="col">Date submitted</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={post.id}>
                        <td>
                          <div className="flex min-w-[220px] items-center gap-3">
                            {post.featured_image ? (
                              <img src={post.featured_image} alt="" className="h-12 w-16 shrink-0 rounded-lg border border-slate-200 object-cover" />
                            ) : (
                              <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400"><BookOpenText className="h-5 w-5" /></span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-900">{post.title || 'Untitled post'}</span>
                              <span className="mt-1 block max-w-xs truncate text-xs text-slate-500">{post.excerpt || 'No excerpt provided.'}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex min-w-[150px] items-center gap-2">
                            {post.author?.profile_image_url ? <img src={post.author.profile_image_url} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{authorName(post.author).slice(0, 1).toUpperCase()}</span>}
                            <span>
                              <span className="block font-medium text-slate-800">{authorName(post.author)}</span>
                              {post.author?.email ? <span className="block text-xs text-slate-500">{post.author.email}</span> : null}
                            </span>
                          </div>
                        </td>
                        <td className="capitalize">{String(post.category || '—').replace(/[_-]/g, ' ')}</td>
                        <td>{formatDate(post.submitted_at || post.created_at)}</td>
                        <td>{renderStatus(post.approval_status)}</td>
                        <td>
                          <div className="flex min-w-[340px] flex-wrap justify-end gap-1.5">
                            {renderPostManagementActions(post, true)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              ) : (
                <div className="p-8">
                  <AdminEmptyState
                    icon="search"
                    title={search || category ? 'No matching posts' : 'No posts in this view'}
                    description={search || category ? 'Try another search or clear the category filter.' : 'Blog submissions will appear here as soon as users send them for review.'}
                  />
                </div>
              )}
            </>
          ) : (
            <>
              {error ? <p role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">{error}</p> : null}
              {loading ? (
                <div className="space-y-3 p-5" aria-label="Loading moderation history">
                  {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : history.length ? (
                <AdminTable wrapClassName="border-0 shadow-none">
                  <thead>
                    <tr><th scope="col">Post</th><th scope="col">Author</th><th scope="col">Decision</th><th scope="col">Status transition</th><th scope="col">Reviewed by</th><th scope="col">Date</th><th scope="col">Administrator feedback</th></tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td className="font-semibold text-slate-900">{entry.blog_title || 'Deleted post'}</td>
                        <td>{authorName(entry.author)}</td>
                        <td><AdminBadge status={entry.action} /></td>
                        <td>{entry.previous_status ? `${statusLabel(entry.previous_status)} → ${statusLabel(entry.new_status)}` : statusLabel(entry.action)}</td>
                        <td>{entry.reviewer?.full_name || entry.reviewer?.email || 'Administrator'}</td>
                        <td>{formatDate(entry.created_at)}</td>
                        <td className="max-w-xs whitespace-normal">{entry.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              ) : (
                <div className="p-8"><AdminEmptyState icon={History} title="No moderation history yet" description="Approval and rejection decisions will be recorded here." /></div>
              )}
            </>
          )}

          {!loading && pagination.pages > 1 ? (
            <AdminTableFooter>
              <span className="text-sm text-slate-500">
                Showing {(pagination.page - 1) * (view === 'history' ? 25 : layout === 'board' ? 50 : 10) + 1}–{Math.min(pagination.page * (view === 'history' ? 25 : layout === 'board' ? 50 : 10), pagination.total)} of {pagination.total}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); setSelectedIds([]) }} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-sm font-semibold text-slate-700">Page {pagination.page} of {pagination.pages}</span>
                <button type="button" disabled={page >= pagination.pages} onClick={() => { setPage((value) => Math.min(pagination.pages, value + 1)); setSelectedIds([]) }} className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </AdminTableFooter>
          ) : null}
        </AdminPanel>
      </div>

      {decisionDialog ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <form onSubmit={handleDecision} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="moderation-decision-title">
            <h2 id="moderation-decision-title" className="text-lg font-bold text-slate-950">
              {decisionDialog.decision === 'approve'
                ? 'Approve blog post'
                : decisionDialog.decision === 'request_changes'
                  ? 'Request changes'
                  : decisionDialog.decision === 'return_to_pending'
                    ? 'Return post to pending review'
                    : 'Reject blog post'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {decisionDialog.posts
                ? `${decisionDialog.posts.length} selected post${decisionDialog.posts.length === 1 ? '' : 's'}`
                : decisionDialog.post?.title || 'Untitled post'}
            </p>
            {decisionDialog.decision === 'approve' ? (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">
                This will approve the post and make it visible to the public.
              </p>
            ) : decisionDialog.decision === 'return_to_pending' ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                This will remove the post from public feeds and return it to the pending approval queue.
              </p>
            ) : (
              <>
                <label htmlFor="moderation-feedback" className="mt-5 block text-sm font-semibold text-slate-700">
                  {decisionDialog.decision === 'request_changes' ? 'Feedback for the author' : 'Reason for rejection'}
                </label>
                <textarea id="moderation-feedback" required maxLength={1000} rows={5} value={moderationFeedback} onChange={(event) => { setModerationFeedback(event.target.value); setReasonError('') }} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" placeholder={decisionDialog.decision === 'request_changes' ? 'Explain what should be revised before resubmission.' : 'Explain why this post cannot be published.'} />
                <p className="mt-1 text-xs text-slate-500">{moderationFeedback.length}/1,000 characters</p>
              </>
            )}
            {reasonError ? <p role="alert" className="mt-2 text-sm text-red-700">{reasonError}</p> : null}
            {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={Boolean(actionId)} onClick={() => { setDecisionDialog(null); setError('') }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={Boolean(actionId)} className={`rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${decisionDialog.decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : decisionDialog.decision === 'request_changes' ? 'bg-blue-600 hover:bg-blue-700' : decisionDialog.decision === 'return_to_pending' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}>
                {actionId ? 'Saving…' : decisionDialog.decision === 'approve' ? 'Confirm approval' : decisionDialog.decision === 'request_changes' ? 'Send feedback' : decisionDialog.decision === 'return_to_pending' ? 'Return to pending' : 'Confirm rejection'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {editPost ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <form onSubmit={saveEdit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-blog-title">
            <h2 id="edit-blog-title" className="text-lg font-bold text-slate-950">Edit blog post</h2>
            <p className="mt-1 text-sm text-slate-600">Changes are saved to the current post status and recorded in moderation history.</p>
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-slate-700">
                Title
                <input required maxLength={200} value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Category
                  <input required maxLength={80} value={editForm.category} onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Featured image URL
                  <input maxLength={2048} type="url" value={editForm.featured_image} onChange={(event) => setEditForm((current) => ({ ...current, featured_image: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-400" />
                </label>
              </div>
              <label className="block text-sm font-semibold text-slate-700">
                Excerpt
                <textarea maxLength={5000} rows={3} value={editForm.excerpt} onChange={(event) => setEditForm((current) => ({ ...current, excerpt: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-blue-400" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Full content
                <textarea required maxLength={50000} rows={12} value={editForm.content} onChange={(event) => setEditForm((current) => ({ ...current, content: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal leading-6 outline-none focus:border-blue-400" />
              </label>
            </div>
            {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={Boolean(actionId)} onClick={() => { setEditPost(null); setError('') }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={Boolean(actionId)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{actionId ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      ) : null}
      {deletePost ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="delete-blog-title">
            <h2 id="delete-blog-title" className="text-lg font-bold text-slate-950">Delete blog post?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              “{deletePost.title || 'Untitled post'}” and its related content will be deleted. The moderation record will remain in history.
            </p>
            {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={Boolean(actionId)} onClick={() => { setDeletePost(null); setError('') }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={Boolean(actionId)} onClick={() => void confirmDelete()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{actionId ? 'Deleting…' : 'Delete post'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  )
}
