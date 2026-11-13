'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminButton, AdminPageHeader, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStaffRoleLabel, normalizeStaffRole } from '@/lib/staffRoles.mjs'
import { getStoredSession } from '@/lib/authCookies';
import { performLogout } from '@/lib/clientLogout';
import EngagementSection from './EngagementSection'
import { notifyToast } from '@/lib/toast.mjs';

export default function AnalyticsAndReportsPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsReport, setAnalyticsReport] = useState(null);
  const [days, setDays] = useState(30);
  const [bucket, setBucket] = useState('day');
  const [exportingFormat, setExportingFormat] = useState('');
  const requestIdRef = useRef(0);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalEvents: 0,
    totalSpots: 0,
    totalBlogs: 0,
    totalFeedback: 0,
    openInquiries: 0,
    avgRating: 0,
  });
  const [visitorMetrics, setVisitorMetrics] = useState({
    days: 30,
    pageViews: 0,
    uniqueVisitors: 0,
    daily: [],
    topPages: [],
  });
  const [categoryData, setCategoryData] = useState([]);
  const [latestReports, setLatestReports] = useState([]);
  const [toast, setToast] = useState(null);
  const isAdministrator = normalizeStaffRole(adminUser?.role) === 'admin';

  const showToast = useCallback((message, isError = false) => {
    setToast(null);
    notifyToast(message, isError ? 'error' : undefined);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setAnalyticsError('');
    try {
      const response = await fetch(`/info/api/admin/analytics?days=${days}&bucket=${bucket}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load analytics.');
      }

      if (requestId !== requestIdRef.current) return;
      const report = result.analytics;
      const summary = report.summary;
      setAnalyticsReport(report);
      setStats({
        totalUsers: summary.totalUsers,
        activeUsers: summary.activeUsers,
        totalEvents: summary.totalEvents,
        totalSpots: summary.totalPlaces,
        totalBlogs: summary.totalBlogs,
        totalFeedback: summary.feedbackCount,
        openInquiries: summary.openInquiries,
        avgRating: Number(summary.averageRating),
      });
      setVisitorMetrics({
        days: report.days,
        pageViews: summary.pageViews,
        uniqueVisitors: summary.uniqueVisitors,
        daily: report.traffic || [],
        topPages: report.topPages || [],
      });
      setCategoryData((report.inquiryCategories || []).map((item) => ({
        label: item.category || 'General',
        value: item.count,
      })));
      setLatestReports([
        { title: 'Average review rating', value: `${summary.averageRating}/5`, tone: 'emerald' },
        { title: 'Sent alerts', value: `${summary.sentAlerts} broadcasts`, tone: 'sky' },
        { title: 'Open inquiries', value: `${summary.openInquiries} items`, tone: 'amber' },
        { title: 'Active destinations', value: `${summary.totalPlaces} places`, tone: 'violet' },
      ]);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      if (requestId === requestIdRef.current) {
        setAnalyticsReport(null);
        setAnalyticsError(err.message || 'Failed to load analytics.');
        showToast('Failed to load analytics.', true);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [days, bucket, showToast]);

  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        router.push('/info/login');
        return;
      }

      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) {
        router.push('/info/admin/dashboard');
        return;
      }

      setAdminUser(userData);
      await fetchAnalytics();
    };

    checkAuth();
  }, [fetchAnalytics, router]);

  const exportReport = async (format) => {
    setExportingFormat(format);
    try {
      const response = await fetch(`/info/api/admin/analytics?days=${days}&bucket=${bucket}&format=${format}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || `Unable to export ${format.toUpperCase()} report.`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `connect-daet-analytics-${days}-days-${bucket}-${new Date().toISOString().slice(0, 10)}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`${format.toUpperCase()} report downloaded.`);
    } catch (error) {
      showToast(error.message || `Unable to export ${format.toUpperCase()} report.`, true);
    } finally {
      setExportingFormat('');
    }
  };

  const handleLogout = async () => {
    await performLogout();
    router.push('/info/login');
  };

  const maxTrendValue = Math.max(...visitorMetrics.daily.map((day) => day.pageViews), 1);

  useEffect(() => {
    if (loading) return;

    const tab = new URLSearchParams(window.location.search).get('tab');
    const targetId = tab === 'visitors'
      ? 'visitors'
      : tab === 'content' || tab === 'popular'
        ? 'content'
        : tab === 'reports'
          ? 'reports'
          : null;
    const hashId = window.location.hash.slice(1);
    const section = targetId || hashId;

    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
          <p className="mt-4 font-medium text-slate-600">Preparing analytics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={adminUser} roleLabel={getStaffRoleLabel(adminUser?.role)} onLogout={handleLogout} />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Insights"
          title="Analytics & reporting"
          description="Explore traffic, audience growth, reviews, alert reach, and staff operations."
          icon="analytics"
          actions={
            <>
              <AdminButton onClick={() => window.print()}>Print</AdminButton>
              <AdminButton disabled={Boolean(exportingFormat)} onClick={() => void exportReport('pdf')}>
                {exportingFormat === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}
              </AdminButton>
              <AdminButton variant="primary" icon="downloads" disabled={Boolean(exportingFormat)} onClick={() => void exportReport('xlsx')}>
                {exportingFormat === 'xlsx' ? 'Preparing Excel...' : 'Export Excel'}
              </AdminButton>
            </>
          }
        />

        {analyticsError ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Analytics could not be loaded.</p>
            <p className="mt-1">{analyticsError}</p>
            <p className="mt-2 text-xs">If this deployment has not been migrated yet, apply migration 100 before retrying.</p>
            <AdminButton className="mt-4" onClick={() => void fetchAnalytics()} disabled={loading}>Retry</AdminButton>
          </div>
        ) : analyticsReport ? (
          <>
        <nav aria-label="Analytics sections" className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { href: '#visitors', label: 'Visitor Statistics', detail: 'Traffic and device mix' },
            { href: '#growth', label: 'Growth and ratings', detail: 'Registrations and visitor reviews' },
            { href: '#alerts', label: 'Alert reach', detail: 'Delivery and open rates' },
            { href: '#engagement', label: 'User Engagement', detail: 'Reactions, shares, and comments' },
            { href: '#reports', label: 'Export Reports', detail: 'Review and download summaries' },
          ].map((item) => (
            <a key={item.href} href={item.href} className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/50">
              <span className="block text-sm font-bold text-slate-800">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>
            </a>
          ))}
        </nav>

        <AdminStatGrid>
          <AdminStatCard label="Users" value={stats.totalUsers} icon="users" tone="brand" meta="Registered accounts" />
          <AdminStatCard label="Active users" value={stats.activeUsers} icon="check" tone="success" meta="Status: active" />
          <AdminStatCard label="Events" value={stats.totalEvents} icon="events" tone="violet" meta="Calendar entries" />
          <AdminStatCard label="Average rating" value={`${stats.avgRating}/5`} icon="star" tone="warning" meta="Visitor feedback" />
        </AdminStatGrid>

        <div className="mb-6 grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)]">
          <div id="visitors" className="scroll-mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Visitor statistics</p>
                <h3 className="mt-2 text-lg font-bold text-slate-800">{bucket === 'day' ? 'Daily' : bucket === 'week' ? 'Weekly' : 'Monthly'} traffic, last {days} days</h3>
                <p className="mt-1 text-xs text-slate-500">Estimated visitors are distinct consented browsers, not verified people.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Group by
                <select
                  value={bucket}
                  onChange={(event) => setBucket(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Reporting period
                <select
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </label>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Page views</p>
                <p className="mt-1 text-2xl font-black text-blue-950">{visitorMetrics.pageViews.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Estimated unique visitors</p>
                <p className="mt-1 text-2xl font-black text-emerald-950">{visitorMetrics.uniqueVisitors.toLocaleString()}</p>
              </div>
            </div>

            {visitorMetrics.daily.length > 0 ? (
              <>
                <div className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-slate-600">
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Page views</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Unique visitors</span>
                </div>
                <div className="overflow-x-auto pb-2">
                  <div className={`flex h-56 items-end gap-2 ${bucket === 'day' ? 'min-w-[720px]' : 'min-w-[320px]'}`}>
                    {visitorMetrics.daily.map((day) => {
                      const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', bucket === 'month'
                        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
                        : { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
                      const pageHeight = (day.pageViews / maxTrendValue) * 100;
                      const visitorHeight = (day.uniqueVisitors / maxTrendValue) * 100;

                      return (
                        <div key={day.date} className="flex h-full min-w-4 flex-1 flex-col items-center justify-end gap-2" title={`${day.date}: ${day.pageViews} page views, ${day.uniqueVisitors} estimated unique visitors`}>
                          <div className="flex h-36 w-full items-end justify-center gap-0.5">
                            <div className="w-1/2 rounded-t-md bg-blue-600" style={{ height: `${pageHeight}%` }} />
                            <div className="w-1/2 rounded-t-md bg-emerald-500" style={{ height: `${visitorHeight}%` }} />
                          </div>
                          <span className="text-[9px] font-medium text-slate-500">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                No consented public page visits have been recorded in this period.
              </p>
            )}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-bold text-slate-800">Most-viewed public pages</h4>
              {visitorMetrics.topPages.length ? (
                <ol className="mt-2 space-y-2">
                  {visitorMetrics.topPages.map((page) => (
                    <li key={page.path} className="flex items-center justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate text-slate-600">{page.path}</span>
                      <span className="shrink-0 font-semibold text-slate-800">{page.pageViews.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Popular pages will appear after consented visits are recorded.</p>
              )}
            </div>
          </div>

          <div className="w-full min-w-0 max-w-full space-y-4 overflow-hidden">
          <div id="reports" className="scroll-mt-6 w-full min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Export reports</p>
                <h3 className="mt-2 text-lg font-bold text-slate-800">Key reports</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <AdminButton disabled={Boolean(exportingFormat)} onClick={() => void exportReport('pdf')}>PDF</AdminButton>
                <AdminButton variant="primary" icon="downloads" disabled={Boolean(exportingFormat)} onClick={() => void exportReport('xlsx')}>Excel</AdminButton>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {latestReports.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.title}</div>
                  <div className="mt-2 text-xl font-bold text-slate-800">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          <div id="growth" className="scroll-mt-6 grid min-w-0 gap-4">
            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Audience growth</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">New registrations</h3>
              <p className="mt-1 text-xs text-slate-500">{analyticsReport.summary.newUsers.toLocaleString()} new users in the selected period</p>
              {analyticsReport.userGrowth.some((day) => day.newUsers > 0) ? (
                <div className="mt-5 flex h-40 items-end gap-1 overflow-x-auto">
                  {analyticsReport.userGrowth.map((day) => {
                    const peak = Math.max(...analyticsReport.userGrowth.map((item) => item.newUsers), 1)
                    const height = Math.max(day.newUsers ? (day.newUsers / peak) * 100 : 0, day.newUsers ? 4 : 0)
                    return (
                      <div key={day.date} className="flex h-full min-w-2 flex-1 flex-col items-center justify-end">
                        <div title={`${day.date}: ${day.newUsers} new users`} className="w-full rounded-t bg-violet-500" style={{ height: `${height}%` }} />
                        <span className="mt-2 text-[9px] text-slate-500">{new Date(`${day.date}T00:00:00Z`).getUTCDate()}</span>
                      </div>
                    )
                  })}
                </div>
              ) : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No registrations were recorded in this period.</p>}
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ratings and reviews</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">Daily average rating</h3>
              <p className="mt-1 text-xs text-slate-500">Based on submitted attraction and event reviews.</p>
              {analyticsReport.ratingsTrend.some((day) => day.reviewCount > 0) ? (
                <div className="mt-5 flex h-40 items-end gap-1 overflow-x-auto">
                  {analyticsReport.ratingsTrend.map((day) => (
                    <div key={day.date} className="flex h-full min-w-2 flex-1 flex-col items-center justify-end">
                      <div title={`${day.date}: ${day.averageRating}/5 from ${day.reviewCount} reviews`} className="w-full rounded-t bg-amber-400" style={{ height: `${day.reviewCount ? Math.max((day.averageRating / 5) * 100, 4) : 0}%` }} />
                      <span className="mt-2 text-[9px] text-slate-500">{new Date(`${day.date}T00:00:00Z`).getUTCDate()}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No attraction or event reviews were recorded in this period.</p>}
            </section>
          </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Device breakdown</p>
            <h3 className="mt-2 text-lg font-bold text-slate-800">Consented visitor screen categories</h3>
            <p className="mt-1 text-xs text-slate-500">Only coarse mobile, tablet, desktop, or legacy-unknown categories are stored.</p>
            {analyticsReport.devices.length ? (
              <div className="mt-4 space-y-4">
                {analyticsReport.devices.map((device) => {
                  const maxViews = Math.max(...analyticsReport.devices.map((item) => item.pageViews), 1)
                  const label = device.deviceType === 'unknown' ? 'Unknown / legacy' : `${device.deviceType[0].toUpperCase()}${device.deviceType.slice(1)}`
                  return (
                    <div key={device.deviceType}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm text-slate-600">
                        <span>{label}</span>
                        <span className="font-semibold text-slate-800">{device.pageViews.toLocaleString()} views</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div className="h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${(device.pageViews / maxViews) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">Device statistics appear as consented visits are recorded.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Destination popularity</p>
            <h3 className="mt-2 text-lg font-bold text-slate-800">Most-viewed places</h3>
            {analyticsReport.popularDestinations.length ? (
              <ol className="mt-4 space-y-3">
                {analyticsReport.popularDestinations.map((place, index) => (
                  <li key={place.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{index + 1}. {place.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{place.pageViews.toLocaleString()} views</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 text-sm text-slate-500">No destination views were recorded in this period.</p>}
          </section>
        </div>

        <section id="alerts" className="mt-4 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Alert reach</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">Broadcast delivery and opens</h3>
              <p className="mt-1 text-xs text-slate-500">{analyticsReport.summary.alertsOpened.toLocaleString()} inbox opens from {analyticsReport.summary.alertsDelivered.toLocaleString()} deliveries</p>
            </div>
            <p className="text-sm font-bold text-slate-700">{analyticsReport.summary.alertsDelivered ? `${Math.round((analyticsReport.summary.alertsOpened / analyticsReport.summary.alertsDelivered) * 100)}% opened` : 'No deliveries'}</p>
          </div>
          {analyticsReport.alertActivity.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <tr><th className="px-3 py-2">Alert</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Sent</th><th className="px-3 py-2">Delivered</th><th className="px-3 py-2">Opened</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {analyticsReport.alertActivity.map((alert) => (
                    <tr key={alert.id}>
                      <td className="max-w-[280px] truncate px-3 py-3 font-semibold text-slate-800">{alert.title}</td>
                      <td className="px-3 py-3 capitalize text-slate-600">{alert.category}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(alert.sentAt).toLocaleDateString()}</td>
                      <td className="px-3 py-3 text-slate-700">{alert.delivered.toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-700">{alert.opened.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No alerts were sent in this period.</p>}
        </section>

        {isAdministrator && (
          <section id="staff-activity" className="mt-4 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Staff operations</p>
            <h3 className="mt-2 text-lg font-bold text-slate-800">Staff activity</h3>
            <p className="mt-1 text-xs text-slate-500">Actions recorded in the system audit log during the selected period.</p>
            {analyticsReport.staffActivity.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <tr><th className="px-3 py-2">Staff member</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Actions</th><th className="px-3 py-2">Last activity</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyticsReport.staffActivity.map((staff) => (
                      <tr key={staff.email}>
                        <td className="px-3 py-3 font-semibold text-slate-800">{staff.name}</td>
                        <td className="px-3 py-3 capitalize text-slate-600">{staff.role.replaceAll('_', ' ')}</td>
                        <td className="px-3 py-3 text-slate-700">{staff.actionCount.toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-500">{new Date(staff.lastActivity).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No staff actions were recorded in this period.</p>}
          </section>
        )}

        <div className="mt-6">
          <EngagementSection />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div id="content" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Content coverage</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">Platform inventory</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Tourist Spots', value: stats.totalSpots },
                { label: 'Blogs', value: stats.totalBlogs },
                { label: 'Feedback Entries', value: stats.totalFeedback },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                    <span>{item.label}</span>
                    <span className="font-semibold text-slate-800">{item.value}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                      style={{ width: `${Math.min((item.value / Math.max(stats.totalSpots + stats.totalBlogs + stats.totalFeedback, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Inquiry mix</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">Top categories</h3>
            </div>
            <div className="space-y-4">
              {categoryData.length === 0 ? (
                <p className="text-sm text-slate-500">No inquiry categories yet.</p>
              ) : (
                categoryData.map((category) => (
                  <div key={category.label}>
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                      <span>{category.label}</span>
                      <span className="font-semibold text-slate-800">{category.value}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        style={{ width: `${(category.value / Math.max(categoryData[0].value, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
            </>
          ) : null}
        </div>

      {toast && (
        <div role={toast.isError ? 'alert' : 'status'} aria-live={toast.isError ? 'assertive' : 'polite'} className={`admin-toast ${toast.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
