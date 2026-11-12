'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  History,
  LayoutGrid,
  List,
  Mail,
  MessageSquareText,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  AdminBadge,
  AdminEmptyState,
  AdminPagination,
  AdminPanel,
  AdminSearch,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
  AdminTable,
  AdminTableFooter,
  AdminToolbar,
} from '@/app/(subsystems)/info/components/admin'
import AdminDiscussionModeration from '@/app/(subsystems)/info/components/admin/AdminDiscussionModeration'

const TABS = [
  { id: 'pending', label: 'Pending approvals' },
  { id: 'all', label: 'All posts' },
  { id: 'approved', label: 'Approved' },
  { id: 'changes_requested', label: 'Changes requested' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'reported', label: 'Reported' },
  { id: 'draft', label: 'My drafts' },
]

const EMPTY_STATS = {
  totalPosts: 0,
  pendingApprovals: 0,
  approvedPosts: 0,
  rejectedPosts: 0,
  changesRequested: 0,
  reportedPosts: 0,
  draftPosts: 0,
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
  const [submittedFrom, setSubmittedFrom] = useState('')
  const [submittedTo, setSubmittedTo] = useState('')
  const [direction, setDirection] = useState('desc')
  const [page, setPage] = useState(1)
  const [posts, setPosts] = useState([])
  const [history, setHistory] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 0, total: 0 })
  const [stats, setStats] = useState(EMPTY_STATS)
  const [adminId, setAdminId] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState('')
  const [error, setError] = useState('')
  const [selectedPost, setSelectedPost] = useState(null)
  const [previewPost, setPreviewPost] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [decisionDialog, setDecisionDialog] = useState(null)
  const [moderationFeedback, setModerationFeedback] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [editPost, setEditPost] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', excerpt: '', content: '', category: '', featured_image: '' })
  const [deletePost, setDeletePost] = useState(null)
  const [historyPost, setHistoryPost] = useState(null)
  const [postHistory, setPostHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

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
      setAdminId(result.adminId || '')
      setPagination(result.pagination || { page: 1, pages: 0, total: 0 })
      if (view === 'history') setHistory(result.history || [])
      else {
        const nextPosts = result.posts || []
        setPosts(nextPosts)
        setSelectedPost((current) => nextPosts.find((post) => post.id === current?.id) || nextPosts[0] || null)
        setPreviewPost((current) => current ? nextPosts.find((post) => post.id === current.id) || null : null)
      }
      return true
    } catch (loadError) {
      console.error('Blog moderation data load failed:', loadError)
      setError(loadError.message || 'Unable to load blog moderation data.')
      setPosts([])
      setHistory([])
      setSelectedPost(null)
      setPreviewPost(null)
      return false
    } finally {
      setLoading(false)
    }
  }, [category, direction, layout, page, search, status, submittedFrom, submittedTo, view])

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

  const openPostHistory = async (post) => {
    setHistoryPost(post)
    setPostHistory([])
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ view: 'history', blogId: post.id, page: '1', pageSize: '100' })
      const response = await fetch(`/info/api/admin/blogs?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load moderation history.')
      setPostHistory(result.history || [])
    } catch (historyError) {
      console.error('Blog moderation history load failed:', historyError)
      setError(historyError.message || 'Unable to load moderation history.')
    } finally {
      setHistoryLoading(false)
    }
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
    if (!adminId || post?.created_by !== adminId) {
      setError('You can only edit blog posts you authored.')
      return
    }
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
    if (!adminId || editPost.created_by !== adminId) {
      setError('You can only edit blog posts you authored.')
      setEditPost(null)
      return
    }
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
      setPreviewPost((current) => current?.id === editPost.id ? { ...current, ...result.blog } : current)
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
      setPreviewPost((current) => current?.id === target.id ? null : current)
      const refreshed = await loadData()
      if (result.notificationWarning) setError(result.notificationWarning)
      else if (!refreshed) setError('The blog post was deleted, but the list could not be refreshed.')
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
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'request_changes')} className={`${buttonClass} border border-blue-200 text-blue-700 hover:bg-blue-50`}><MessageSquareText className="h-3.5 w-3.5" />Request changes</button>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'reject')} className={`${buttonClass} border border-red-200 text-red-700 hover:bg-red-50`}><X className="h-3.5 w-3.5" />Reject</button>
          </>
        ) : null}
        {state === 'approved' ? (
          <>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'return_to_pending')} className={`${buttonClass} border border-amber-200 text-amber-800 hover:bg-amber-50`}><RotateCcw className="h-3.5 w-3.5" />Unpublish</button>
            <button type="button" disabled={busy} onClick={() => openDecision(post, 'request_changes')} className={`${buttonClass} border border-blue-200 text-blue-700 hover:bg-blue-50`}><MessageSquareText className="h-3.5 w-3.5" />Request changes</button>
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
        <button type="button" onClick={() => setPreviewPost(post)} className={buttonClass}><Eye className="h-3.5 w-3.5" />Preview</button>
        {post.created_by === adminId ? <button type="button" disabled={Boolean(actionId)} onClick={() => openEdit(post)} className={`${buttonClass} disabled:opacity-50`}><Pencil className="h-3.5 w-3.5" />Edit</button> : null}
        {renderModerationActions(post, compact)}
        <button type="button" disabled={Boolean(actionId)} onClick={() => setDeletePost(post)} className={`${buttonClass} border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50`}><Trash2 className="h-3.5 w-3.5" />Delete</button>
      </>
    )
  }

  const tabCount = (tabId) => ({
    all: stats.totalPosts,
    pending: stats.pendingApprovals,
    approved: stats.approvedPosts,
    changes_requested: stats.changesRequested,
    rejected: stats.rejectedPosts,
    reported: stats.reportedPosts,
    draft: stats.draftPosts,
  })[tabId]

  const changeTab = (nextStatus) => {
    setPage(1)
    setView('posts')
    setSelectedIds([])
    setSelectedPost(null)
    setPreviewPost(null)
    router.replace(`/info/admin/blogs?status=${nextStatus}`, { scroll: false })
  }

  const changeView = (nextView) => {
    setPage(1)
    setView(nextView)
    setSelectedIds([])
    setPreviewPost(null)
  }

  const selectPost = (post) => {
    setSelectedPost(post)
  }

  const handleQueueKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !posts.length) return
    event.preventDefault()
    const currentIndex = posts.findIndex((post) => post.id === selectedPost?.id)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? posts.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + posts.length) % posts.length
    selectPost(posts[nextIndex])
    document.getElementById(`blog-queue-card-${posts[nextIndex].id}`)?.focus()
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
      description="Review submissions before publication, provide actionable feedback, and manage published tourism stories."
      headerIcon="blog"
      actions={(
        <Link href="/info/admin/blog" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700">
          <Plus className="h-4 w-4" />Create Post
        </Link>
      )}
      contentClassName="pb-10"
    >
      <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8">
        <AdminStatGrid columns={5}>
          <AdminStatCard label="Total posts" value={stats.totalPosts} icon="content" href="/info/admin/blogs?status=all" />
          <AdminStatCard label="Pending approvals" value={stats.pendingApprovals} icon="moderation" tone="warning" className="ring-1 ring-amber-300 shadow-md" href="/info/admin/blogs?status=pending" />
          <AdminStatCard label="Approved posts" value={stats.approvedPosts} icon="blog" tone="success" href="/info/admin/blogs?status=approved" />
          <AdminStatCard label="Changes requested" value={stats.changesRequested} icon="moderation" tone="info" href="/info/admin/blogs?status=changes_requested" />
          <AdminStatCard label="Reported posts" value={stats.reportedPosts} icon="moderation" tone="danger" href="/info/admin/blogs?status=reported" />
        </AdminStatGrid>

        <AdminPanel
          title={view === 'history' ? 'Moderation history' : 'Content moderation'}
          description={view === 'history'
            ? 'A record of administrator decisions and feedback.'
            : 'Pending content → review → approve, reject, or request changes.'}
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
                    role="tab"
                    aria-selected={status === tab.id}
                    className={`rounded-t-xl border-b-2 px-3 py-2 text-sm font-semibold transition ${
                      status === tab.id
                        ? 'border-blue-600 bg-blue-50/60 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                      tab.id === 'pending' ? 'bg-amber-100 text-amber-800' :
                        tab.id === 'reported' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}>{tabCount(tab.id)}</span>
                  </button>
                ))}
              </div>

              <AdminToolbar className="border-b border-slate-100 px-4 py-3 sm:px-5">
                <AdminSearch
                  value={search}
                  onChange={(value) => { setSearch(value); setPage(1); setSelectedIds([]) }}
                  placeholder="Search posts or authors..."
                  label="Search blog posts by title or author"
                  className="min-w-[220px] flex-1"
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
                <fieldset className="flex items-center gap-1">
                  <legend className="sr-only">Date range</legend>
                  <label className="sr-only" htmlFor="blog-submitted-from">Submitted from</label>
                  <input id="blog-submitted-from" type="date" value={submittedFrom} onChange={(event) => { setSubmittedFrom(event.target.value); setPage(1); setSelectedIds([]) }} className="min-h-10 w-[138px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400" />
                  <span className="text-xs text-slate-400">to</span>
                  <label className="sr-only" htmlFor="blog-submitted-to">Submitted to</label>
                  <input id="blog-submitted-to" type="date" value={submittedTo} onChange={(event) => { setSubmittedTo(event.target.value); setPage(1); setSelectedIds([]) }} className="min-h-10 w-[138px] rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400" />
                </fieldset>
                <button
                  type="button"
                  onClick={() => { setDirection((value) => value === 'desc' ? 'asc' : 'desc'); setPage(1); setSelectedIds([]) }}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label={`Sort by submission date ${direction === 'desc' ? 'ascending' : 'descending'}`}
                >
                  {direction === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                  Sort
                </button>
                <div className="ml-auto flex rounded-xl border border-slate-200 p-1" role="group" aria-label="Post display mode">
                  <button type="button" onClick={() => { setLayout('board'); setPage(1); setSelectedIds([]) }} aria-pressed={layout === 'board'} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${layout === 'board' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><LayoutGrid className="h-4 w-4" />Board</button>
                  <button type="button" onClick={() => { setLayout('list'); setPage(1); setSelectedIds([]) }} aria-pressed={layout === 'list'} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${layout === 'list' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><List className="h-4 w-4" />List</button>
                </div>
              </AdminToolbar>

              {error ? <p role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">{error}</p> : null}

              {loading ? (
                <div className="space-y-3 p-5" aria-label="Loading blog posts">
                  {[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : layout === 'board' ? (
                <div className="grid gap-0 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <section className="min-w-0 border-b border-slate-100 lg:border-b-0 lg:border-r" aria-label="Blog review queue">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                      <div>
                        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-800">
                          {status === 'pending' ? 'Pending approvals' : status === 'reported' ? 'Reported posts' : `${statusLabel(status)} posts`}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {status === 'pending'
                            ? `${pagination.total} ${pagination.total === 1 ? 'post requires' : 'posts require'} review`
                            : `${pagination.total} posts · select a post to review`}
                        </p>
                      </div>
                      {status === 'pending' ? (
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={posts.length > 0 && posts.filter((post) => post.approval_status === 'pending').every((post) => selectedIds.includes(post.id))}
                            onChange={(event) => setSelectedIds(event.target.checked ? posts.filter((post) => post.approval_status === 'pending').map((post) => post.id) : [])}
                            aria-label="Select all pending posts on this page"
                          />
                          Select all
                        </label>
                      ) : null}
                    </div>
                    {status === 'pending' && selectedIds.length ? (
                      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/95 px-4 py-3 shadow-sm backdrop-blur">
                        <span className="mr-auto self-center text-xs font-bold text-blue-900">{selectedIds.length} selected</span>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('approve')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Approve selected</button>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('request_changes')} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50">Request changes</button>
                        <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('reject')} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">Reject selected</button>
                      </div>
                    ) : null}
                    {posts.length ? (
                      <div
                        className="max-h-[68vh] space-y-2 overflow-y-auto p-3"
                        tabIndex={0}
                        onKeyDown={handleQueueKeyDown}
                        aria-label="Submission queue. Use the up and down arrow keys to move between posts."
                      >
                        {posts.map((post) => (
                        <div
                          key={post.id}
                          id={`blog-queue-card-${post.id}`}
                          tabIndex={0}
                          onFocus={() => setSelectedPost(post)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              selectPost(post)
                            }
                          }}
                          draggable={post.approval_status === 'pending'}
                          onDragStart={(event) => { event.dataTransfer.setData('text/plain', post.id); event.dataTransfer.effectAllowed = 'move' }}
                          className={`flex gap-3 rounded-xl border p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-blue-400 ${selectedPost?.id === post.id ? 'border-blue-300 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          aria-label={`${post.title || 'Untitled post'}, ${statusLabel(post.approval_status)}, by ${authorName(post.author)}`}
                        >
                          {status === 'pending' ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(post.id)}
                              onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, post.id])] : current.filter((id) => id !== post.id))}
                              aria-label={`Select ${post.title || 'Untitled post'}`}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                            />
                          ) : null}
                          <button type="button" onClick={() => selectPost(post)} aria-pressed={selectedPost?.id === post.id} className="flex min-w-0 flex-1 gap-3 text-left">
                              {post.featured_image ? <img src={post.featured_image} alt="" className="h-[68px] w-[88px] shrink-0 rounded-lg border border-slate-200 object-cover" /> : <span className="flex h-[68px] w-[88px] shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><BookOpenText className="h-6 w-6" /></span>}
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="truncate text-sm font-bold text-slate-900">{post.title || 'Untitled post'}</span>
                                  <span className="shrink-0">{renderStatus(post.approval_status)}</span>
                                </span>
                                <span className="mt-1 block line-clamp-1 text-xs text-slate-600">{plainText(post.excerpt || post.content).slice(0, 120) || 'No excerpt provided.'}</span>
                                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                                  <span className="font-semibold text-slate-700">{authorName(post.author)}</span>
                                  {post.author?.email ? <span>{post.author.email}</span> : null}
                                  <span className="capitalize">{String(post.category || 'Uncategorized').replace(/[_-]/g, ' ')}</span>
                                  <span>{formatDate(post.submitted_at || post.created_at)}</span>
                                </span>
                              </span>
                          </button>
                        </div>
                        ))}
                      </div>
                    ) : status === 'pending' && !search && !category && !submittedFrom && !submittedTo ? (
                      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-6 w-6" /></span>
                        <h4 className="mt-4 text-sm font-bold text-slate-900">No pending approvals</h4>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">All submitted posts have been reviewed.</p>
                        <button type="button" onClick={() => changeTab('all')} className="mt-4 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">View All Posts</button>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-sm text-slate-500">
                        {status === 'reported' && !search && !category && !submittedFrom && !submittedTo
                          ? 'No open reports for blog posts.'
                          : 'No posts match these filters.'}
                      </div>
                    )}
                    {status === 'pending' && posts.length ? (
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

                  <section className="flex min-w-0 flex-col lg:max-h-[80vh]" aria-label="Selected blog preview">
                    {selectedPost ? (
                      <>
                        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Post preview</p>
                              <h3 className="mt-2 text-xl font-bold leading-tight text-slate-950">{selectedPost.title || 'Untitled post'}</h3>
                              <p className="mt-1 text-sm text-slate-500">{authorName(selectedPost.author)}{selectedPost.author?.email ? ` · ${selectedPost.author.email}` : ''}</p>
                            </div>
                            {renderStatus(selectedPost.approval_status)}
                          </div>
                          {selectedPost.featured_image ? <img src={selectedPost.featured_image} alt="" className="mt-4 max-h-64 w-full rounded-xl border border-slate-200 object-cover" /> : null}
                          {selectedPost.excerpt ? <p className="mt-4 border-l-2 border-blue-200 pl-3 text-sm font-medium leading-6 text-slate-700">{selectedPost.excerpt}</p> : null}
                          <article className="mx-auto mt-5 max-w-3xl whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">
                            {plainText(selectedPost.content) || 'No article content provided.'}
                          </article>
                          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Moderation details</p>
                            <dl className="mt-3 grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Status</dt><dd className="mt-1 text-slate-700">{statusLabel(selectedPost.approval_status)}</dd></div>
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Submitted</dt><dd className="mt-1 text-slate-700">{formatDate(selectedPost.submitted_at || selectedPost.created_at)}</dd></div>
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Author</dt><dd className="mt-1 text-slate-700">{authorName(selectedPost.author)}</dd></div>
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Category</dt><dd className="mt-1 capitalize text-slate-700">{String(selectedPost.category || 'Uncategorized').replace(/[_-]/g, ' ')}</dd></div>
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Last modified</dt><dd className="mt-1 text-slate-700">{formatDate(selectedPost.updated_at || selectedPost.reviewed_at || selectedPost.created_at)}</dd></div>
                              <div><dt className="font-bold uppercase tracking-wide text-slate-400">Moderated by</dt><dd className="mt-1 text-slate-700">{selectedPost.reviewer?.full_name || selectedPost.reviewer?.email || (selectedPost.reviewed_by ? 'Daet Tourism Admin' : 'Not reviewed')}</dd></div>
                            </dl>
                            {selectedPost.rejection_reason ? (
                              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                                <strong>Moderation reason:</strong> {selectedPost.rejection_reason}
                              </p>
                            ) : null}
                            {selectedPost.reports?.length ? (
                              <div className="mt-4 border-t border-slate-200 pt-3">
                                <p className="text-xs font-bold text-red-700">{selectedPost.reports.length} open report{selectedPost.reports.length === 1 ? '' : 's'}</p>
                                {selectedPost.reports.map((report) => <p key={report.id} className="mt-1 text-xs leading-5 text-slate-600"><strong>{report.reason}:</strong> {report.description || 'No additional details.'}</p>)}
                              </div>
                            ) : null}
                          </div>
                          <AdminDiscussionModeration key={`blog:${selectedPost.id}`} contentType="blog" contentId={selectedPost.id} />
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <button type="button" onClick={() => void openPostHistory(selectedPost)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              <History className="h-3.5 w-3.5" />View moderation history
                            </button>
                            <div className="flex gap-2">
                              {selectedPost.created_by === adminId ? <button type="button" disabled={Boolean(actionId)} onClick={() => openEdit(selectedPost)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" />Edit</button> : null}
                              <button type="button" disabled={Boolean(actionId)} onClick={() => setDeletePost(selectedPost)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                            </div>
                          </div>
                        </div>
                        {selectedPost.approval_status === 'pending' ? (
                          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_20px_-18px_rgba(15,23,42,0.5)] backdrop-blur sm:px-5">
                            <span className="mr-auto text-xs font-bold text-amber-800">{renderStatus('pending')}<span className="ml-2 hidden sm:inline">Decision required</span></span>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'reject')} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Reject</button>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'request_changes')} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Request changes</button>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="mr-1 inline h-3.5 w-3.5" />Approve</button>
                          </div>
                        ) : selectedPost.approval_status === 'approved' ? (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-emerald-50/70 px-4 py-3 sm:px-5">
                            <div className="mr-auto text-sm text-emerald-800">
                              <p className="font-bold"><Check className="mr-1 inline h-4 w-4" />Approved</p>
                              <p className="mt-1 text-xs">Approved by {selectedPost.reviewer?.full_name || selectedPost.reviewer?.email || 'Daet Tourism Admin'} · {formatDate(selectedPost.reviewed_at)}</p>
                            </div>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'request_changes')} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Request changes</button>
                          </div>
                        ) : selectedPost.approval_status === 'rejected' ? (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-red-50/70 px-4 py-3 sm:px-5">
                            <span className="mr-auto text-xs font-bold text-red-800">Rejected · {selectedPost.rejection_reason || 'No reason provided.'}</span>
                            <button type="button" disabled={Boolean(actionId)} onClick={() => openDecision(selectedPost, 'request_changes')} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Request changes</button>
                          </div>
                        ) : selectedPost.approval_status === 'changes_requested' ? (
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-blue-50/70 px-4 py-3 sm:px-5">
                            <span className="mr-auto text-xs font-bold text-blue-800">Changes requested · {selectedPost.rejection_reason || 'Awaiting author revision.'}</span>
                            {selectedPost.created_by === adminId ? <button type="button" disabled={Boolean(actionId)} onClick={() => openEdit(selectedPost)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">Review revision</button> : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                        <Eye className="h-8 w-8 text-slate-300" />
                        <h3 className="mt-3 text-sm font-bold text-slate-800">{posts.length ? 'Choose a submission' : 'Nothing to review'}</h3>
                        <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{posts.length ? 'The complete post and author details will appear here for review.' : 'Use the filters or choose another moderation tab.'}</p>
                      </div>
                    )}
                  </section>
                </div>
              ) : posts.length ? (
                <>
                  {status === 'pending' && selectedIds.length ? (
                    <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50/80 px-4 py-3">
                      <span className="mr-auto text-xs font-bold text-blue-900">{selectedIds.length} selected</span>
                      <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('approve')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Approve selected</button>
                      <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('request_changes')} className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-50">Request changes</button>
                      <button type="button" disabled={Boolean(actionId)} onClick={() => openBulkDecision('reject')} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">Reject selected</button>
                    </div>
                  ) : null}
                  <AdminTable wrapClassName="border-0 shadow-none">
                    <thead>
                      <tr>
                        {status === 'pending' ? (
                          <th scope="col">
                            <input type="checkbox" checked={posts.length > 0 && posts.every((post) => selectedIds.includes(post.id))} onChange={(event) => setSelectedIds(event.target.checked ? posts.map((post) => post.id) : [])} aria-label="Select all pending posts on this page" className="h-4 w-4 accent-blue-600" />
                          </th>
                        ) : null}
                        <th scope="col">Post</th>
                        <th scope="col">Author</th>
                        <th scope="col">Category</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Last modified</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {posts.map((post) => (
                      <tr key={post.id}>
                        {status === 'pending' ? (
                          <td><input type="checkbox" checked={selectedIds.includes(post.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, post.id])] : current.filter((id) => id !== post.id))} aria-label={`Select ${post.title || 'Untitled post'}`} className="h-4 w-4 accent-blue-600" /></td>
                        ) : null}
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
                        <td>{formatDate(post.reviewed_at || post.updated_at || post.created_at)}</td>
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
                </>
              ) : (
                <div className="p-8">
                  {status === 'pending' && !search && !category && !submittedFrom && !submittedTo ? (
                    <div className="flex flex-col items-center text-center">
                      <AdminEmptyState icon={Check} title="No pending approvals" description="All submitted posts have been reviewed." />
                      <button type="button" onClick={() => changeTab('all')} className="mt-4 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">View All Posts</button>
                    </div>
                  ) : (
                    <AdminEmptyState
                      icon="search"
                      title={search || category || submittedFrom || submittedTo ? 'No matching posts' : status === 'reported' ? 'No reported posts' : 'No posts in this view'}
                      description={search || category || submittedFrom || submittedTo ? 'Try another search or clear the filters.' : status === 'reported' ? 'There are no open reports for blog posts.' : 'Blog submissions will appear here as soon as users send them for review.'}
                    />
                  )}
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
              <AdminPagination
                page={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                pageSize={view === 'history' ? 25 : layout === 'board' ? 50 : 10}
                itemLabel="posts"
                onPageChange={(nextPage) => { setPage(nextPage); setSelectedIds([]) }}
              />
            </AdminTableFooter>
          ) : null}
        </AdminPanel>
      </div>

      {previewPost ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" role="presentation">
          <section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="blog-list-preview-title">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-4 backdrop-blur sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Post preview</p>
                <h2 id="blog-list-preview-title" className="mt-1 break-words text-xl font-bold text-slate-950">{previewPost.title || 'Untitled post'}</h2>
                <p className="mt-1 text-sm text-slate-500">{authorName(previewPost.author)}{previewPost.author?.email ? ` · ${previewPost.author.email}` : ''}</p>
              </div>
              <button type="button" onClick={() => setPreviewPost(null)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </header>
            <div className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {renderStatus(previewPost.approval_status)}
                <div className="flex flex-wrap gap-2">
                  {renderModerationActions(previewPost)}
                  {previewPost.created_by === adminId ? <button type="button" onClick={() => { setPreviewPost(null); openEdit(previewPost) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button> : null}
                  <button type="button" onClick={() => setDeletePost(previewPost)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button>
                </div>
              </div>
              {previewPost.featured_image ? <Image src={previewPost.featured_image} alt="" width={1200} height={600} unoptimized className="mt-5 max-h-[28rem] w-full rounded-xl border border-slate-200 object-cover" /> : null}
              {previewPost.excerpt ? <p className="mt-5 border-l-2 border-blue-200 pl-3 text-sm font-medium leading-6 text-slate-700">{previewPost.excerpt}</p> : null}
              <article className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-700">{plainText(previewPost.content) || 'No article content provided.'}</article>
              <AdminDiscussionModeration key={`blog:${previewPost.id}`} contentType="blog" contentId={previewPost.id} />
            </div>
          </section>
        </div>
      ) : null}

      {historyPost ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
          <section className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="blog-history-title">
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Audit trail</p>
                <h2 id="blog-history-title" className="mt-1 text-lg font-bold text-slate-950">Moderation history</h2>
                <p className="mt-1 text-sm text-slate-500">{historyPost.title || 'Untitled post'}</p>
              </div>
              <button type="button" onClick={() => setHistoryPost(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Close</button>
            </header>
            <div className="max-h-[65vh] overflow-y-auto p-5">
              {historyLoading ? (
                <div className="space-y-3" aria-label="Loading moderation history">
                  {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : postHistory.length ? (
                <ol className="space-y-3">
                  {postHistory.map((entry) => (
                    <li key={entry.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold capitalize text-slate-900">{entry.action.replace(/_/g, ' ')}</p>
                          <p className="mt-1 text-xs text-slate-600">{entry.reviewer?.full_name || entry.reviewer?.email || 'Daet Tourism Admin'}</p>
                        </div>
                        <time className="text-xs text-slate-500">{formatDate(entry.created_at)}</time>
                      </div>
                      {entry.previous_status || entry.new_status ? <p className="mt-2 text-xs text-slate-600">{statusLabel(entry.previous_status)} → {statusLabel(entry.new_status)}</p> : null}
                      {entry.reason ? <p className="mt-2 border-l-2 border-blue-200 pl-3 text-xs leading-5 text-slate-600">{entry.reason}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <AdminEmptyState icon={History} title="No moderation history yet" description="Approval and rejection decisions will be recorded here." />
              )}
            </div>
          </section>
        </div>
      ) : null}
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
            ) : decisionDialog.decision === 'request_changes' ? (
              <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-800">
                This will remove the post from public view until the author updates and resubmits it.
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
