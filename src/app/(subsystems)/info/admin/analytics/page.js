'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminButton, AdminPageHeader, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import { Icon } from '@/app/(subsystems)/info/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import { performLogout } from '@/lib/clientLogout';

export default function AnalyticsAndReportsPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
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

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [usersRes, eventsRes, spotsRes, blogsRes, feedbackRes, inquiriesRes, visitorResponse] = await Promise.all([
        supabase.from('info_users').select('id, status, user_type, last_login, created_at'),
        supabase.from('info_events').select('id, created_at'),
        supabase.from('info_tourist_spots').select('id, name, created_at'),
        supabase.from('info_blogs').select('id, created_at'),
        supabase.from('info_feedback').select('id, rating, created_at'),
        supabase.from('info_inquiries').select('id, status, category, created_at'),
        fetch('/info/api/analytics/visits', { credentials: 'same-origin', cache: 'no-store' }),
      ]);

      const visitorResult = await visitorResponse.json();
      if (!visitorResponse.ok || !visitorResult.success) {
        throw new Error(visitorResult.message || 'Unable to load visitor statistics.');
      }
      if (usersRes.error) throw usersRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (spotsRes.error) throw spotsRes.error;
      if (blogsRes.error) throw blogsRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      if (inquiriesRes.error) throw inquiriesRes.error;

      const users = usersRes.data || [];
      const events = eventsRes.data || [];
      const spots = spotsRes.data || [];
      const blogs = blogsRes.data || [];
      const feedback = feedbackRes.data || [];
      const inquiries = inquiriesRes.data || [];

      const avgRating = feedback.length
        ? (feedback.reduce((acc, item) => acc + (Number(item.rating) || 0), 0) / feedback.length).toFixed(1)
        : '0.0';

      const categoryBreakdown = [
        { label: 'Safety', value: inquiries.filter((item) => item.category === 'safety').length },
        { label: 'Booking', value: inquiries.filter((item) => item.category === 'booking').length },
        { label: 'Feedback', value: inquiries.filter((item) => item.category === 'feedback').length },
        { label: 'Reports', value: inquiries.filter((item) => item.category === 'report').length },
        { label: 'General', value: inquiries.filter((item) => item.category === 'general').length },
      ].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

      const reports = [
        { title: 'Visitor satisfaction', value: `${avgRating}/5`, tone: 'emerald' },
        { title: 'Event engagement', value: `${events.length} live listings`, tone: 'sky' },
        { title: 'Open issues', value: `${inquiries.filter((item) => item.status === 'open').length} items`, tone: 'amber' },
        { title: 'Content reach', value: `${blogs.length + spots.length} entries`, tone: 'violet' },
      ];

      setStats({
        totalUsers: users.length,
        activeUsers: users.filter((user) => user.status === 'active').length,
        totalEvents: events.length,
        totalSpots: spots.length,
        totalBlogs: blogs.length,
        totalFeedback: feedback.length,
        openInquiries: inquiries.filter((item) => item.status === 'open').length,
        avgRating: Number(avgRating),
      });

      setVisitorMetrics(visitorResult.metrics);
      setCategoryData(categoryBreakdown);
      setLatestReports(reports);
    } catch (err) {
      console.error('Analytics fetch error:', err);
      showToast('Failed to load analytics.', true);
    }
  }, [showToast]);

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
      setLoading(false);
    };

    checkAuth();
  }, [fetchAnalytics, router]);

  const exportSummary = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Users', stats.totalUsers],
      ['Active Users', stats.activeUsers],
      ['Total Events', stats.totalEvents],
      ['Tourist Spots', stats.totalSpots],
      ['Blogs', stats.totalBlogs],
      ['Feedback Entries', stats.totalFeedback],
      ['Open Inquiries', stats.openInquiries],
      ['Average Rating', `${stats.avgRating}`],
      ['Page Views (30 days)', visitorMetrics.pageViews],
      ['Estimated Unique Visitors (30 days)', visitorMetrics.uniqueVisitors],
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daet_analytics_summary_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Analytics summary exported.');
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

    if (tab === 'engagement') {
      router.replace('/info/admin/engagement');
      return;
    }

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
      <AdminSidebar user={adminUser} roleLabel="Administrator" onLogout={handleLogout} />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Insights"
          title="Analytics & reporting"
          description="Monitor engagement, response pressure, and system health across the tourism platform."
          icon="analytics"
          actions={
            <>
              <AdminButton onClick={() => window.print()}>Print</AdminButton>
              <AdminButton variant="primary" icon="downloads" onClick={exportSummary}>Export summary</AdminButton>
            </>
          }
        />

        <AdminStatGrid>
          <AdminStatCard label="Users" value={stats.totalUsers} icon="users" tone="brand" meta="Registered accounts" />
          <AdminStatCard label="Active users" value={stats.activeUsers} icon="check" tone="success" meta="Status: active" />
          <AdminStatCard label="Events" value={stats.totalEvents} icon="events" tone="violet" meta="Calendar entries" />
          <AdminStatCard label="Average rating" value={`${stats.avgRating}/5`} icon="star" tone="warning" meta="Visitor feedback" />
        </AdminStatGrid>

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <div id="visitors" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Visitor statistics</p>
                <h3 className="mt-2 text-lg font-bold text-slate-800">Last 30 days</h3>
                <p className="mt-1 text-xs text-slate-500">Estimated unique visitors count consented browsers, not verified people.</p>
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
                  <div className="flex h-56 min-w-[720px] items-end gap-2">
                    {visitorMetrics.daily.map((day) => {
                      const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', {
                        month: 'numeric',
                        day: 'numeric',
                        timeZone: 'UTC',
                      });
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

          <div id="reports" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Key reports</p>
            <div className="mt-4 space-y-3">
              {latestReports.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.title}</div>
                  <div className="mt-2 text-xl font-bold text-slate-800">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
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
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${toast.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
