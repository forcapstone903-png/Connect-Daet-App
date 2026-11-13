'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminStatCard, { AdminStatGrid } from '@/app/(subsystems)/info/components/admin/AdminStatCard'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'

const EMPTY_REPORT = { summary: {}, userGrowth: [], staffActivity: [], popularDestinations: [] }

async function readJson(url) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) {
    throw new Error(result.message || `Unable to load ${url}.`)
  }
  return result
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : '—'
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

function getAuditActor(activity) {
  const profile = Array.isArray(activity.info_users) ? activity.info_users[0] : activity.info_users
  return profile?.full_name || profile?.email || 'System'
}

function AdminNotificationShortcut() {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let active = true
    const loadUnreadCount = () => {
      readJson('/info/api/notifications?count_only=true&scope=staff')
        .then((result) => {
          if (active) setUnreadCount(Number(result.unread_count) || 0)
        })
        .catch((error) => {
          console.error('Admin notification count load failed:', error)
        })
    }

    loadUnreadCount()
    const intervalId = window.setInterval(loadUnreadCount, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <Link
      href="/info/admin/notifications/inbox"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
      aria-label={`System notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      title="System notifications"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  )
}

function formatGrowthDate(value) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? String(value || '')
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function UserGrowthChart({ data }) {
  const chartData = data.map((day) => ({
    ...day,
    newUsers: Number.isFinite(Number(day.newUsers)) ? Math.max(0, Number(day.newUsers)) : 0,
    totalUsers: Number.isFinite(Number(day.totalUsers)) ? Math.max(0, Number(day.totalUsers)) : 0,
  }))
  const maxNewUsers = Math.max(...chartData.map((day) => day.newUsers), 1)
  const newUsersAxisMax = Math.max(4, Math.ceil(maxNewUsers / 4) * 4)
  const minTotalUsers = Math.min(...chartData.map((day) => day.totalUsers))
  const maxTotalUsers = Math.max(...chartData.map((day) => day.totalUsers))
  const totalPadding = Math.max(1, Math.ceil((maxTotalUsers - minTotalUsers) * 0.1))
  const totalAxisMin = Math.max(0, minTotalUsers - totalPadding)
  const totalAxisMax = maxTotalUsers + totalPadding
  const totalAxisRange = Math.max(totalAxisMax - totalAxisMin, 1)
  const plot = { left: 58, right: 560, top: 28, bottom: 194 }
  const points = chartData.map((day, index) => {
    const x = chartData.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + (index / (chartData.length - 1)) * (plot.right - plot.left)
    const barHeight = (day.newUsers / newUsersAxisMax) * (plot.bottom - plot.top)
    const lineY = plot.bottom - ((day.totalUsers - totalAxisMin) / totalAxisRange) * (plot.bottom - plot.top)
    return { day, x, barHeight, lineY }
  })
  const linePath = points
    .map(({ x, lineY }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${lineY}`)
    .join(' ')
  const newUsersTicks = [newUsersAxisMax, newUsersAxisMax / 2, 0]

  return (
    <figure className="min-w-0" aria-label="User growth over the latest seven days">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" aria-hidden="true" />
          New users (left axis)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 bg-blue-700" aria-hidden="true" />
          Total users (right axis)
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          className="block h-auto min-w-[540px] w-full"
          viewBox="0 0 640 256"
          role="img"
          aria-labelledby="user-growth-chart-title user-growth-chart-description"
        >
          <title id="user-growth-chart-title">Daily new users and cumulative users</title>
          <desc id="user-growth-chart-description">
            Bars show new users per day on the left scale. The line shows cumulative users on the right scale.
          </desc>

          {newUsersTicks.map((tick, index) => {
            const y = plot.top + (index / (newUsersTicks.length - 1)) * (plot.bottom - plot.top)
            return (
              <g key={tick}>
                <line x1={plot.left} x2={plot.right} y1={y} y2={y} stroke="var(--line)" strokeDasharray={index === 2 ? undefined : '3 5'} />
                <text x={plot.left - 10} y={y + 4} textAnchor="end" fill="var(--muted-ink)" fontSize="11">
                  {formatNumber(tick)}
                </text>
              </g>
            )
          })}

          <text x={plot.right + 12} y={plot.top + 4} fill="var(--muted-ink)" fontSize="11">
            {formatNumber(maxTotalUsers)}
          </text>
          <text x={plot.right + 12} y={plot.bottom + 4} fill="var(--muted-ink)" fontSize="11">
            {formatNumber(minTotalUsers)}
          </text>

          {points.map(({ day, x, barHeight }) => (
            <rect
              key={`bar-${day.date}`}
              x={x - 16}
              y={plot.bottom - barHeight}
              width="32"
              height={barHeight}
              rx="5"
              fill="#2563eb"
              fillOpacity="0.22"
            >
              <title>{`${day.date}: ${formatNumber(day.newUsers)} new users`}</title>
            </rect>
          ))}

          <path d={linePath} fill="none" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(({ day, x, lineY }) => (
            <circle key={`total-${day.date}`} cx={x} cy={lineY} r="4" fill="var(--paper)" stroke="#1d4ed8" strokeWidth="2">
              <title>{`${day.date}: ${formatNumber(day.totalUsers)} total users`}</title>
            </circle>
          ))}

          {points.map(({ day, x }) => (
            <text key={`date-${day.date}`} x={x} y="222" textAnchor="middle" fill="var(--muted-ink)" fontSize="11">
              {formatGrowthDate(day.date)}
            </text>
          ))}
        </svg>
      </div>
      <ul className="sr-only">
        {points.map(({ day }) => (
          <li key={day.date}>
            {day.date}: {formatNumber(day.newUsers)} new users, {formatNumber(day.totalUsers)} total users.
          </li>
        ))}
      </ul>
    </figure>
  )
}

function PopularDestinationsChart({ data }) {
  const chartData = data.map((place) => {
    const pageViews = Number(place.pageViews)
    return {
      ...place,
      pageViews: Number.isFinite(pageViews) ? Math.max(0, pageViews) : 0,
    }
  })
  const maxViews = Math.max(...chartData.map((place) => place.pageViews), 0)

  return (
    <figure aria-label="Popular destinations ranked by page views">
      <ol className="space-y-4">
        {chartData.map((place, index) => {
          const name = place.name || 'Unnamed destination'
          const barWidth = maxViews > 0 ? (place.pageViews / maxViews) * 100 : 0

          return (
            <li key={place.id || `${name}-${index}`} className="min-w-0">
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-4">
                <span title={name} className="min-w-0 truncate text-sm font-semibold text-slate-800">
                  {name}
                </span>
                <span className="shrink-0 text-xs text-slate-600">
                  {formatNumber(place.pageViews)} views
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-slate-100"
                role="meter"
                aria-label={`${name}: ${formatNumber(place.pageViews)} page views`}
                aria-valuemin={0}
                aria-valuemax={maxViews || 1}
                aria-valuenow={place.pageViews}
              >
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex justify-between text-xs text-slate-500" aria-hidden="true">
        <span>0</span>
        <span>{formatNumber(maxViews)} views</span>
      </div>
    </figure>
  )
}

export default function AdminDashboard() {
  const [refreshing, setRefreshing] = useState(false)
  const [dashboardLoaded, setDashboardLoaded] = useState(false)
  const [analytics, setAnalytics] = useState(EMPTY_REPORT)
  const [auditLogs, setAuditLogs] = useState([])
  const [systemChecks, setSystemChecks] = useState(null)
  const [errors, setErrors] = useState({ analytics: '', audit: '', health: '' })

  const fetchDashboard = useCallback(() => Promise.allSettled([
      readJson('/info/api/admin/analytics?days=30'),
      readJson('/info/api/admin/audit-logs?limit=6'),
      readJson('/info/api/admin/system-health'),
    ]), [])

  const applyDashboardResults = useCallback((results) => {
    const [analyticsResult, auditResult, healthResult] = results
    if (analyticsResult.status === 'fulfilled') {
      setAnalytics(analyticsResult.value.analytics || EMPTY_REPORT)
    } else {
      setAnalytics(EMPTY_REPORT)
      setErrors((current) => ({ ...current, analytics: analyticsResult.reason?.message || 'Analytics are unavailable.' }))
    }

    if (auditResult.status === 'fulfilled') {
      setAuditLogs(auditResult.value.activities || [])
    } else {
      setAuditLogs([])
      setErrors((current) => ({ ...current, audit: auditResult.reason?.message || 'Audit logs are unavailable.' }))
    }

    if (healthResult.status === 'fulfilled') {
      setSystemChecks(healthResult.value.checks || null)
    } else {
      setSystemChecks(null)
      setErrors((current) => ({ ...current, health: healthResult.reason?.message || 'System health is unavailable.' }))
    }

    setDashboardLoaded(true)
  }, [])

  const loadDashboard = useCallback(async () => {
    setRefreshing(true)
    setErrors({ analytics: '', audit: '', health: '' })
    const results = await fetchDashboard()
    applyDashboardResults(results)
    setRefreshing(false)
  }, [applyDashboardResults, fetchDashboard])

  useEffect(() => {
    let active = true
    fetchDashboard().then((results) => {
      if (active) applyDashboardResults(results)
    })
    return () => { active = false }
  }, [applyDashboardResults, fetchDashboard])

  const summary = analytics.summary || {}
  const growth = Array.isArray(analytics.userGrowth) ? analytics.userGrowth.slice(-7) : []
  const staffActivity = Array.isArray(analytics.staffActivity) ? analytics.staffActivity.slice(0, 5) : []
  const popularDestinations = Array.isArray(analytics.popularDestinations)
    ? analytics.popularDestinations.slice(0, 5)
    : []

  return (
    <AdminShell
      roleLabel="System Administrator"
      eyebrow="Super Admin"
      title="Administration Overview"
      description="Manage accounts, review system activity, and monitor Connect Daet."
      headerIcon="dashboard"
      headerClassName="mx-4 sm:mx-6 lg:mx-8"
      actions={(
        <div className="flex items-center gap-2">
          <AdminNotificationShortcut />
          <AdminButton icon="refresh" onClick={() => void loadDashboard()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </AdminButton>
        </div>
      )}
    >
      <div className="space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        {errors.analytics ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <p className="font-semibold">System totals and analytics could not be loaded.</p>
            <p className="mt-1">{errors.analytics}</p>
          </div>
        ) : null}

        <AdminStatGrid>
          <AdminStatCard
            label="Total users"
            value={summary.totalUsers}
            meta={`${formatNumber(summary.activeUsers)} active · ${formatNumber(summary.totalStaff)} staff`}
            icon="users"
            tone="brand"
            loading={!dashboardLoaded}
            href="/info/admin/users"
          />
          <AdminStatCard
            label="Active attractions"
            value={summary.totalPlaces}
            meta="Published destinations"
            icon="attractions"
            tone="info"
            loading={!dashboardLoaded}
            href="/info/admin/tourist-spots"
          />
          <AdminStatCard
            label="Total posts"
            value={summary.totalPosts ?? summary.totalBlogs}
            meta={`${formatNumber(summary.totalBlogs)} blogs · ${formatNumber(summary.totalForumThreads)} forum · ${formatNumber(summary.totalCommunityPosts)} community`}
            icon="blog"
            tone="success"
            loading={!dashboardLoaded}
            href="/info/admin/blogs?status=approved"
          />
          <AdminStatCard
            label="Alerts sent"
            value={summary.totalAlertsSent ?? summary.sentAlerts}
            meta={`${formatNumber(summary.sentAlerts)} in the last 30 days`}
            icon="warning"
            tone="warning"
            loading={!dashboardLoaded}
            href="/info/admin/analytics#alerts"
          />
        </AdminStatGrid>

        <div className="grid gap-6 xl:grid-cols-2">
          <AdminPanel
            title="User growth"
            description="Daily new and cumulative accounts in the latest 7 days."
            actions={<AdminButton href="/info/admin/analytics#growth">View analytics</AdminButton>}
          >
            {errors.analytics ? (
              <p className="text-sm text-red-700" role="status">{errors.analytics}</p>
            ) : growth.length ? (
              <UserGrowthChart data={growth} />
            ) : (
              <p className="text-sm text-slate-500">No user-growth data is available for this period.</p>
            )}
          </AdminPanel>

          <AdminPanel
            title="Staff activity"
            description="Most active staff accounts in the last 30 days."
            actions={<AdminButton href="/info/admin/analytics#staff-activity">View report</AdminButton>}
          >
            {errors.analytics ? (
              <p className="text-sm text-red-700" role="status">{errors.analytics}</p>
            ) : staffActivity.length ? (
              <div className="divide-y divide-slate-100">
                {staffActivity.map((staff) => (
                  <div key={staff.email || `${staff.name}-${staff.role}`} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{staff.name || staff.email}</p>
                      <p className="text-xs capitalize text-slate-500">{String(staff.role || '').replaceAll('_', ' ')}</p>
                    </div>
                    <span className="shrink-0 text-sm text-slate-600">
                      {formatNumber(staff.actionCount)} actions
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No staff activity is recorded for this period.</p>
            )}
          </AdminPanel>
        </div>

        <AdminPanel
          title="Popular destinations"
          description="Most-viewed destinations from consented detail-page visits in the last 30 days."
          actions={<AdminButton href="/info/admin/analytics#content">View analytics</AdminButton>}
        >
          {errors.analytics ? (
            <p className="text-sm text-red-700" role="status">{errors.analytics}</p>
          ) : popularDestinations.length ? (
            <PopularDestinationsChart data={popularDestinations} />
          ) : (
            <p className="text-sm text-slate-500">No consented destination views recorded in the last 30 days.</p>
          )}
        </AdminPanel>

        <div className="grid gap-6 xl:grid-cols-2">
          <AdminPanel
            title="Recent audit events"
            description="Latest system-level actions recorded by the application."
            actions={<AdminButton href="/info/admin/activity-logs">Open audit logs</AdminButton>}
          >
            {errors.audit ? (
              <p className="text-sm text-red-700" role="alert">{errors.audit}</p>
            ) : auditLogs.length ? (
              <div className="divide-y divide-slate-100">
                {auditLogs.map((activity) => (
                  <div key={activity.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="text-sm font-semibold capitalize text-slate-800">
                        {String(activity.activity_type || 'system event').replaceAll('_', ' ')}
                      </p>
                      <time dateTime={activity.created_at} className="text-xs text-slate-500">
                        {formatDate(activity.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {getAuditActor(activity)}
                      {activity.entity_type ? ` · ${activity.entity_type}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No audit events have been recorded yet.</p>
            )}
          </AdminPanel>

          <AdminPanel
            title="System health"
            description="Current availability checks for the application’s core services."
            actions={<AdminButton href="/info/admin/settings/security">Security settings</AdminButton>}
          >
            {errors.health ? (
              <p className="text-sm text-red-700" role="alert">{errors.health}</p>
            ) : systemChecks ? (
              <div className="divide-y divide-slate-100">
                {[
                  ['Application API', systemChecks.api],
                  ['Database', systemChecks.database],
                  ['File storage', systemChecks.storage],
                  ['Email delivery', systemChecks.emailConfiguration],
                ].map(([label, check]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{label}</p>
                      <p className="truncate text-xs text-slate-500">{check?.detail || 'No status returned.'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {check?.status || 'Unknown'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">System health checks are unavailable.</p>
            )}
          </AdminPanel>
        </div>
      </div>
    </AdminShell>
  )
}
