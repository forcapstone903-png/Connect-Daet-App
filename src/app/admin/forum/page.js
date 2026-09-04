'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import { supabase } from '@/lib/supabase';

const FORUM_CATEGORIES = [
  'General',
  'Local Tips',
  'Travel Q&A',
  'Safety',
  'Announcements',
  'Community',
];

export default function AdminForumPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState([]);
  const [reports, setReports] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingThread, setEditingThread] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadForm, setThreadForm] = useState({ title: '', content: '', status: 'published', category: 'General' });
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [pinnedThreads, setPinnedThreads] = useState([]);
  const [customCategories, setCustomCategories] = useState(FORUM_CATEGORIES);
  const [newCategory, setNewCategory] = useState('');

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchThreads = async () => {
    try {
      let query = '/api/admin/forum';
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if ([...params].length) query += `?${params.toString()}`;

      const res = await fetch(query);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load threads');
      setThreads(data.threads || []);
    } catch (err) {
      console.error('Error fetching forum threads:', err);
      showToast(err.message, true);
    }
  };

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('info_moderation')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching moderation reports:', err);
      setReports([]);
    }
  };

  const openCreateModal = () => {
    setEditingThread(null);
    setThreadForm({ title: '', content: '', status: 'published', category: customCategories[0] || 'General' });
    setShowModal(true);
  };

  const openEditModal = (thread) => {
    setEditingThread(thread);
    setThreadForm({
      title: thread.title || '',
      content: thread.content || '',
      status: thread.status || 'published',
      category: thread.category || 'General',
    });
    setShowModal(true);
  };

  const saveThread = async () => {
    if (!threadForm.title.trim() || !threadForm.content.trim()) {
      showToast('Title and content are required.', true);
      return;
    }

    setSaving(true);
    try {
      const method = editingThread ? 'PUT' : 'POST';
      const url = editingThread ? `/api/admin/forum/${editingThread.id}` : '/api/admin/forum';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: threadForm.title,
          content: threadForm.content,
          status: threadForm.status,
          created_by: editingThread ? undefined : user?.id || null,
          category: threadForm.category,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to save thread');

      showToast(editingThread ? 'Thread updated successfully!' : 'Thread created successfully!');
      setShowModal(false);
      setEditingThread(null);
      await fetchThreads();
    } catch (err) {
      console.error('Error saving forum thread:', err);
      showToast(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const deleteThread = async (thread) => {
    if (!confirm(`Delete thread "${thread.title}"?`)) return;

    try {
      const res = await fetch(`/api/admin/forum/${thread.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to delete thread');
      showToast('Thread deleted successfully!');
      await fetchThreads();
    } catch (err) {
      console.error('Error deleting forum thread:', err);
      showToast(err.message, true);
    }
  };

  const pinThread = (threadId) => {
    setPinnedThreads((prev) =>
      prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId]
    );
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value) return;
    setCustomCategories((prev) => [...prev, value]);
    setNewCategory('');
  };

  const openViewModal = (thread) => {
    setSelectedThread(thread);
  };

  const closeViewModal = () => {
    setSelectedThread(null);
  };

  const stats = useMemo(() => {
    return {
      total: threads.length,
      active: threads.filter((thread) => thread.status === 'published').length,
      locked: threads.filter((thread) => thread.status === 'closed').length,
      pinned: pinnedThreads.length,
      reports: reports.length,
    };
  }, [threads, pinnedThreads, reports]);

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchesSearch = !searchTerm || (thread.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || thread.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || (thread.category || 'General') === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [threads, searchTerm, statusFilter, categoryFilter]);

  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) return window.location.assign('/login');
      const sessionUser = JSON.parse(session);
      if (!hasAdminAccess(sessionUser.role)) return window.location.assign('/dashboard');
      setUser(sessionUser);
      await fetchThreads();
      await fetchReports();
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Forum Moderation</h1>
            <p className="text-gray-500 mt-1">Review threads, approve replies, manage categories, and respond to reports.</p>
          </div>
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700">
            <span>+</span>
            <span>Create thread</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Threads</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Active</p>
            <p className="mt-2 text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Locked</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{stats.locked}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Pinned</p>
            <p className="mt-2 text-2xl font-bold text-purple-600">{stats.pinned}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Reports</p>
            <p className="mt-2 text-2xl font-bold text-orange-600">{stats.reports}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search threads..."
              className="w-full rounded-2xl border border-gray-200 px-4 py-2"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-2xl border border-gray-200 px-4 py-2">
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full rounded-2xl border border-gray-200 px-4 py-2">
              <option value="all">All categories</option>
              {customCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <button onClick={fetchThreads} className="rounded-2xl bg-gray-800 px-4 py-2 text-white hover:bg-gray-900">Refresh</button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
          <div className="grid gap-4">
            {filteredThreads.length ? filteredThreads.map((thread) => (
              <div key={thread.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-semibold text-gray-900">{thread.title}</h2>
                      {pinnedThreads.includes(thread.id) && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700">Pinned</span>}
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{thread.reply_count || 0} replies · {thread.status} · {(thread.category || 'General')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pinThread(thread.id)} className="rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">{pinnedThreads.includes(thread.id) ? 'Unpin' : 'Pin'}</button>
                    <button onClick={() => openViewModal(thread)} className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">View</button>
                    <button onClick={() => openEditModal(thread)} className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">Edit</button>
                    <button onClick={() => deleteThread(thread)} className="rounded-full bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100">Delete</button>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-gray-600 line-clamp-3">{thread.content}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>Created: {new Date(thread.created_at).toLocaleString()}</span>
                  <span>Last activity: {thread.last_activity_at ? new Date(thread.last_activity_at).toLocaleString() : '—'}</span>
                </div>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
                No forum threads found.
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-3">Forum Categories</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {customCategories.map((category) => (
                  <span key={category} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{category}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Add category"
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
                <button onClick={addCategory} className="rounded-xl bg-gray-800 px-3 py-2 text-sm text-white">Add</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-3">Report Queue</h3>
              <div className="space-y-3">
                {reports.length ? reports.map((report) => (
                  <div key={report.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase text-red-600">{report.report_type}</span>
                      <span className="text-[10px] uppercase text-gray-500">{report.status}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium text-gray-800">{report.reason}</p>
                    <p className="mt-1 text-xs text-gray-500">{report.description || 'No additional details provided.'}</p>
                  </div>
                )) : (
                  <p className="text-sm text-gray-500">No active reports.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-3">FAQ</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="rounded-lg bg-gray-50 p-2"><strong>Q:</strong> How do I pin a thread?</div>
                <div className="rounded-lg bg-gray-50 p-2"><strong>Q:</strong> Where do I review reports?</div>
                <div className="rounded-lg bg-gray-50 p-2"><strong>Q:</strong> Can I close a thread?</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{editingThread ? 'Edit Thread' : 'Create Thread'}</h3>
                <p className="text-sm text-gray-500">Use this form to add or update forum discussions.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">Close</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={threadForm.title}
                  onChange={(e) => setThreadForm({ ...threadForm, title: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  value={threadForm.category}
                  onChange={(e) => setThreadForm({ ...threadForm, category: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                >
                  {customCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Content</label>
                <textarea
                  rows={6}
                  value={threadForm.content}
                  onChange={(e) => setThreadForm({ ...threadForm, content: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={threadForm.status}
                  onChange={(e) => setThreadForm({ ...threadForm, status: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3"
                >
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 justify-end">
              <button onClick={() => setShowModal(false)} className="rounded-full border border-gray-200 px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveThread} disabled={saving} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Thread'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">{selectedThread.title}</h3>
              <button onClick={closeViewModal} className="text-gray-400 hover:text-gray-600">Close</button>
            </div>
            <p className="text-sm leading-6 text-gray-700 whitespace-pre-wrap">{selectedThread.content}</p>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
