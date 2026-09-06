'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import { performLogout } from '@/lib/clientLogout';

const DEFAULT_STATUSES = ['open', 'in_progress', 'answered', 'closed', 'cancelled'];
const DEFAULT_CATEGORIES = ['general', 'booking', 'safety', 'feedback', 'report', 'other'];

export default function FeedbackAndComplaintPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchRecords = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('info_inquiries')
        .select('* , user:user_id (full_name, email)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data || []).map((item) => ({ ...item, user_name: item.user?.full_name || 'Unknown visitor' })));
    } catch (err) {
      console.error('Error fetching feedback/complaints:', err);
      showToast('Failed to load feedback and complaints.', true);
      setItems([]);
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
        router.push('/admin/dashboard');
        return;
      }

      setAdminUser(userData);
      await fetchRecords();
      setLoading(false);
    };

    checkAuth();
  }, [fetchRecords, router]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const { data, error } = await supabase.from('info_inquiries').select('status, category');
        if (error) throw error;
        const sts = Array.from(new Set((data || []).map(r => r.status).filter(Boolean)));
        if (sts.length) setStatuses(sts);
        const cats = Array.from(new Set((data || []).map(r => r.category).filter(Boolean)));
        if (cats.length) setCategories(cats);
      } catch (e) {
        console.error('Error loading feedback lookups:', e);
      }
    };
    loadLookups();
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch = !query ||
        (item.title || '').toLowerCase().includes(query) ||
        (item.message || '').toLowerCase().includes(query) ||
        (item.user?.email || '').toLowerCase().includes(query) ||
        (item.user_name || '').toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [items, search, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const total = items.length;
    const open = items.filter((item) => item.status === 'open').length;
    const inProgress = items.filter((item) => item.status === 'in_progress').length;
    const answered = items.filter((item) => item.status === 'answered').length;
    const safety = items.filter((item) => item.category === 'safety').length;
    return { total, open, inProgress, answered, safety };
  }, [items]);

  const updateStatus = async (recordId, nextStatus) => {
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
          responded_by: adminUser?.id || null,
          responded_at: nextStatus === 'answered' || nextStatus === 'closed' ? new Date().toISOString() : null,
        })
        .eq('id', recordId);

      if (error) throw error;
      await fetchRecords();
      showToast(`Status updated to ${nextStatus}.`);
    } catch (err) {
      showToast('Unable to update status.', true);
    }
  };

  const saveResponse = async () => {
    if (!selectedItem) return;
    if (!responseText.trim()) {
      showToast('Response can’t be empty.', true);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('info_inquiries')
        .update({
          status: 'answered',
          admin_response: responseText.trim(),
          responded_by: adminUser?.id || null,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id);

      if (error) throw error;

      showToast('Response saved successfully.');
      setResponseText('');
      setSelectedItem(null);
      await fetchRecords();
    } catch (err) {
      showToast('Failed to save reply.', true);
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Title', 'Category', 'Status', 'Submitted By', 'Email', 'Created At', 'Response'],
      ...filteredItems.map((item) => [
        item.title || '',
        item.category || '',
        item.status || '',
        item.user_name || '',
        item.user?.email || '',
        item.created_at || '',
        item.admin_response || '',
      ]),
    ];

    const csv = rows
      .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daet_feedback_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Feedback export downloaded.');
  };

  const handleLogout = async () => {
    await performLogout();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-violet-600" />
          <p className="mt-4 font-medium text-slate-600">Loading feedback workspace...</p>
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
            <h1 className="text-2xl font-bold text-slate-800">Feedback & Complaint Management</h1>
            <p className="mt-1 text-sm text-slate-500">Track messages, allocate follow-up, and resolve visitor concerns.</p>
          </div>
          <button
            onClick={exportCSV}
            className="rounded-full bg-slate-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Export CSV
          </button>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-5">
          {[
            { label: 'Total', value: stats.total, tone: 'violet', icon: 'Inbox' },
            { label: 'Open', value: stats.open, tone: 'amber', icon: 'Open' },
            { label: 'In Progress', value: stats.inProgress, tone: 'blue', icon: 'In progress' },
            { label: 'Answered', value: stats.answered, tone: 'green', icon: 'Answered' },
            { label: 'Safety Reports', value: stats.safety, tone: 'red', icon: 'Reports' },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-sm text-gray-600">{card.icon}</div>
              <div className="text-2xl font-bold text-slate-800">{card.value}</div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[220px] flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, message, or email"
                className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{status.replace('_', ' ')}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                      No complaint tickets match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{item.title || 'Untitled case'}</div>
                        <div className="mt-1 line-clamp-2 max-w-md text-sm text-slate-500">{item.message}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 capitalize">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={item.status || 'open'}
                          onChange={(e) => updateStatus(item.id, e.target.value)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium capitalize text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>{status.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-700">{item.user_name}</div>
                        <div className="text-xs text-slate-400">{item.user?.email || 'No email'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedItem(item);
                            setResponseText(item.admin_response || '');
                          }}
                          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                        >
                          Respond
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-violet-500">Case response</p>
                <h3 className="mt-1 text-xl font-bold text-slate-800">{selectedItem.title || 'Case details'}</h3>
              </div>
                <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-slate-700">Close</button>
            </div>

            <div className="mb-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              <div className="mb-1 font-medium text-slate-700">Visitor message</div>
              <p>{selectedItem.message}</p>
            </div>

            <label className="mb-1 block text-sm font-medium text-slate-700">Admin response</label>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={6}
              placeholder="Write a helpful response to the visitor..."
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                onClick={saveResponse}
                disabled={saving}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save response'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-sm border ${toast.isError ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}">
          {toast.message}
        </div>
      )}
    </div>
  );
}
