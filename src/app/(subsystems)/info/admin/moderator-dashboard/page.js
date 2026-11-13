'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'

async function readJson(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Unable to load moderation data.')
  }
  return result
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—'
}

function getDashboardSummary(blogs, moderation) {
  const stats = moderation.stats || {}
  const count = (value) => Number(value) || 0
  const pendingCommunity = [
    stats.pendingPosts,
    stats.pendingForumTopics,
    stats.pendingForumReplies,
    stats.pendingComments,
    stats.pendingBlogComments,
  ].reduce((total, value) => total + count(value), 0)
  const openInquiries = count(stats.openInquiries) + count(stats.inProgressInquiries)

  return {
    pendingBlogs: count(blogs.stats?.pendingApprovals),
    pendingCommunity,
    pendingPosts: count(stats.pendingPosts),
    pendingForumTopics: count(stats.pendingForumTopics),
    pendingDiscussion: count(stats.pendingForumReplies) + count(stats.pendingComments) + count(stats.pendingBlogComments),
    pendingReports: count(stats.pendingReports),
    pendingAppeals: count(stats.pendingAppeals),
    flaggedPosts: count(stats.flaggedPosts),
    openInquiries,
    receivedReports: count(stats.receivedReports),
    resolvedReports: count(stats.resolvedReports),
    activeBans: count(stats.activeBans),
  }
}

function WorkloadChart({ items, loading }) {
  const maxValue = Math.max(1, ...items.map((item) => item.value))

  if (loading) {
    return <p className="text-sm text-slate-500">Loading moderation workload…</p>
  }

  return (
    <ul className="space-y-4" aria-label="Moderation workload by queue">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{formatNumber(item.value)}</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
            role="progressbar"
            aria-label={`${item.label} awaiting action`}
            aria-valuemin={0}
            aria-valuemax={maxValue}
            aria-valuenow={item.value}
          >
            <div
              className={`h-full rounded-full transition-[width] ${item.color}`}
              style={{ width: item.value ? `${Math.max(3, (item.value / maxValue) * 100)}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function ModeratorDashboard() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unreadNotifications, setUnreadNotifications] = useState(0)

  const loadSummary = useCallback(async () => {
    const [blogs, moderation] = await Promise.all([
      readJson('/info/api/admin/blogs?status=all&pageSize=1'),
      readJson('/info/api/admin/moderation?view=summary'),
    ])
    return getDashboardSummary(blogs, moderation)
  }, [])

  useEffect(() => {
    let active = true
    loadSummary()
      .then((nextSummary) => {
        if (active) {
          setSummary(nextSummary)
          setError('')
        }
      })
      .catch((loadError) => {
        if (active) {
          console.error('Moderator dashboard load failed:', loadError)
          setError(loadError.message || 'Unable to load the moderation dashboard.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadSummary])

  const refreshSummary = useCallback(() => {
    setLoading(true)
    setError('')
    loadSummary()
      .then((nextSummary) => setSummary(nextSummary))
      .catch((loadError) => {
        console.error('Moderator dashboard load failed:', loadError)
        setError(loadError.message || 'Unable to load the moderation dashboard.')
      })
      .finally(() => setLoading(false))
  }, [loadSummary])

  useEffect(() => {
    let active = true
    const loadUnreadNotifications = () => {
      readJson('/info/api/notifications?count_only=true&scope=staff')
        .then((result) => {
          if (active) setUnreadNotifications(Number(result.unread_count) || 0)
        })
        .catch((notificationError) => {
          console.error('Moderator notification count load failed:', notificationError)
        })
    }

    loadUnreadNotifications()
    const intervalId = window.setInterval(loadUnreadNotifications, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const communityCount = summary?.pendingCommunity
  const workloadItems = summary ? [
    { label: 'Blog approvals', value: summary.pendingBlogs, color: 'bg-orange-500' },
    { label: 'Community posts', value: summary.pendingPosts, color: 'bg-blue-500' },
    { label: 'Forum topics', value: summary.pendingForumTopics, color: 'bg-violet-500' },
    { label: 'Comments and replies', value: summary.pendingDiscussion, color: 'bg-cyan-500' },
    { label: 'Open reports', value: summary.pendingReports, color: 'bg-red-500' },
    { label: 'Restriction appeals', value: summary.pendingAppeals, color: 'bg-amber-500' },
    { label: 'Inquiries', value: summary.openInquiries, color: 'bg-emerald-500' },
    { label: 'Flagged posts', value: summary.flaggedPosts, color: 'bg-fuchsia-500' },
  ] : []
  const actionItems = summary ? [
    { label: 'Blog approvals', description: 'Review submitted blog posts', count: summary.pendingBlogs, href: '/info/admin/blogs?status=pending' },
    { label: 'Community submissions', description: 'Review posts, topics, comments, and replies', count: summary.pendingCommunity, href: '/info/admin/moderation?tab=posts' },
    { label: 'Open reports', description: 'Review reports submitted by community members', count: summary.pendingReports, href: '/info/admin/moderation?tab=reports' },
    { label: 'Restriction appeals', description: 'Review appeals from restricted accounts', count: summary.pendingAppeals, href: '/info/admin/moderation?tab=reports' },
    { label: 'Inquiries needing a reply', description: 'Respond to open and in-progress inquiries', count: summary.openInquiries, href: '/info/admin/moderation?tab=inquiries' },
    { label: 'Flagged posts', description: 'Inspect posts flagged by moderation rules', count: summary.flaggedPosts, href: '/info/admin/moderation?tab=posts' },
  ].filter((item) => item.count > 0) : []

  return (
    <AdminShell
      roleLabel="Moderator"
      eyebrow="Community Safety"
      title="Moderator Dashboard"
      description="Review submissions, handle reports, and manage community safety work."
      headerIcon="moderation"
      actions={(
        <div className="flex items-center gap-2">
          <Link
            href="/info/admin/moderation/notifications"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
            aria-label={`Post notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
            title="Post notifications"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            ) : null}
          </Link>
          <AdminButton icon="refresh" onClick={refreshSummary} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </AdminButton>
        </div>
      )}
    >
      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {error ? (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p>{error}</p>
            <button type="button" onClick={refreshSummary} className="shrink-0 font-semibold underline">
              Try again
            </button>
          </div>
        ) : null}

        <AdminStatGrid columns={3}>
          <AdminStatCard label="Pending blog approvals" value={summary ? formatNumber(summary.pendingBlogs) : undefined} icon="blog" tone="warning" loading={loading} href="/info/admin/blogs?status=pending" />
          <AdminStatCard label="Community submissions" value={summary ? formatNumber(communityCount) : undefined} icon="community" tone="info" loading={loading} href="/info/admin/moderation?tab=posts" />
          <AdminStatCard label="Open reports" value={summary ? formatNumber(summary.pendingReports) : undefined} icon="moderation" tone="danger" loading={loading} href="/info/admin/moderation?tab=reports" />
          <AdminStatCard label="Pending appeals" value={summary ? formatNumber(summary.pendingAppeals) : undefined} icon="users" tone="warning" loading={loading} href="/info/admin/moderation?tab=reports" />
          <AdminStatCard label="Open inquiries" value={summary ? formatNumber(summary.openInquiries) : undefined} icon="feedback" tone="success" loading={loading} href="/info/admin/moderation?tab=inquiries" />
          <AdminStatCard label="Flagged posts" value={summary ? formatNumber(summary.flaggedPosts) : undefined} icon="moderation" tone="violet" loading={loading} href="/info/admin/moderation?tab=posts" />
        </AdminStatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <AdminPanel
            title="Moderation workload"
            description="Items currently waiting for review or a response."
            className="min-w-0"
          >
            <WorkloadChart items={workloadItems} loading={loading || !summary} />
          </AdminPanel>

          <AdminPanel
            title="Needs attention"
            description="Open the relevant queue to review and resolve these items."
            className="min-w-0"
          >
            {loading || !summary ? (
              <p className="text-sm text-slate-500">Loading action queues…</p>
            ) : actionItems.length ? (
              <ul className="space-y-2">
                {actionItems.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{item.description}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-sm font-bold tabular-nums text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">
                        {formatNumber(item.count)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                Nothing is waiting for moderator action right now.
              </p>
            )}
          </AdminPanel>
        </div>

        {summary ? (
          <p className="text-xs text-slate-500">
            {formatNumber(summary.receivedReports)} reports received · {formatNumber(summary.resolvedReports)} resolved · {formatNumber(summary.activeBans)} active restrictions
          </p>
        ) : null}
      </div>
    </AdminShell>
  )
}
