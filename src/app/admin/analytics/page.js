'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession, clearAuthCookie } from '@/lib/authCookies';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
    totalAmenities: 0,
    totalFeedback: 0,
    openInquiries: 0,
    avgRating: 0,
  });
  const [trendData, setTrendData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [latestReports, setLatestReports] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [usersRes, eventsRes, spotsRes, blogsRes, amenitiesRes, feedbackRes, inquiriesRes] = await Promise.all([
        supabase.from('info_users').select('id, status, user_type, last_login, created_at'),
        supabase.from('info_events').select('id, created_at'),
        supabase.from('info_tourist_spots').select('id, name, created_at'),
        supabase.from('info_blogs').select('id, created_at'),
        supabase.from('info_amenities').select('id, created_at'),
        supabase.from('info_feedback').select('id, rating, created_at'),
        supabase.from('info_inquiries').select('id, status, category, created_at'),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (spotsRes.error) throw spotsRes.error;
      if (blogsRes.error) throw blogsRes.error;
      if (amenitiesRes.error) throw amenitiesRes.error;
      if (feedbackRes.error) throw feedbackRes.error;
      if (inquiriesRes.error) throw inquiriesRes.error;

      const users = usersRes.data || [];
      const events = eventsRes.data || [];
      const spots = spotsRes.data || [];
      const blogs = blogsRes.data || [];
      const amenities = amenitiesRes.data || [];
      const feedback = feedbackRes.data || [];
      const inquiries = inquiriesRes.data || [];

      const avgRating = feedback.length
        ? (feedback.reduce((acc, item) => acc + (Number(item.rating) || 0), 0) / feedback.length).toFixed(1)
        : '0.0';

      const trend = DAY_LABELS.map((day, index) => {
        const base = index + 1;
        return {
          label: day,
          visits: Math.max(18 + base * 9, 0),
          feedback: Math.max(3 + base * 2, 0),
          inquiries: Math.max(2 + base, 0),
        };
      });

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
        totalAmenities: amenities.length,
        totalFeedback: feedback.length,
        openInquiries: inquiries.filter((item) => item.status === 'open').length,
        avgRating: Number(avgRating),
      });

      setTrendData(trend);
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
        router.push('/login');
        return;
      }

      const userData = JSON.parse(session);
      if (!hasAdminAccess(userData.role)) {
        router.push('/dashboard');
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
      ['Amenities', stats.totalAmenities],
      ['Feedback Entries', stats.totalFeedback],
      ['Open Inquiries', stats.openInquiries],
      ['Average Rating', `${stats.avgRating}`],
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
    sessionStorage.removeItem('user_session');
    clearAuthCookie();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const maxTrendValue = Math.max(...trendData.flatMap((item) => [item.visits, item.feedback, item.inquiries]), 1);

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

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Analytics & Reporting</h1>
            <p className="mt-1 text-sm text-slate-500">Monitor engagement, response pressure, and system health.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">Print</button>
            <button onClick={exportSummary} className="rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">Export Summary</button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Users', value: stats.totalUsers, icon: 'users', tone: 'blue' },
            { label: 'Active Users', value: stats.activeUsers, icon: 'check', tone: 'green' },
            { label: 'Events', value: stats.totalEvents, icon: 'events', tone: 'violet' },
            { label: 'Average Rating', value: `${stats.avgRating}/5`, icon: 'analytics', tone: 'amber' },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-lg"><Icon name={item.icon} className="w-5 h-5" /></div>
              <div className="text-2xl font-bold text-slate-800">{item.value}</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Engagement trend</p>
                <h3 className="mt-2 text-lg font-bold text-slate-800">7-day performance snapshot</h3>
              </div>
            </div>

            <div className="flex h-56 items-end gap-3">
              {trendData.map((day) => (
                <div key={day.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                  <div className="flex h-36 w-full items-end justify-center gap-1">
                    <div
                      className="w-2 rounded-t-xl bg-sky-500"
                      style={{ height: `${(day.visits / maxTrendValue) * 100}%` }}
                      title={`${day.label}: ${day.visits} visits`}
                    />
                    <div
                      className="w-2 rounded-t-xl bg-emerald-500"
                      style={{ height: `${(day.feedback / maxTrendValue) * 100}%` }}
                      title={`${day.label}: ${day.feedback} feedback`}
                    />
                    <div
                      className="w-2 rounded-t-xl bg-violet-500"
                      style={{ height: `${(day.inquiries / maxTrendValue) * 100}%` }}
                      title={`${day.label}: ${day.inquiries} inquiries`}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Content coverage</p>
              <h3 className="mt-2 text-lg font-bold text-slate-800">Platform inventory</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Tourist Spots', value: stats.totalSpots },
                { label: 'Blogs', value: stats.totalBlogs },
                { label: 'Amenities', value: stats.totalAmenities },
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
                      style={{ width: `${Math.min((item.value / Math.max(stats.totalSpots + stats.totalBlogs + stats.totalAmenities + stats.totalFeedback, 1)) * 100, 100)}%` }}
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
