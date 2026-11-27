'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminButton, AdminPageHeader, AdminPageSkeleton, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import AdminDiscussionModeration from '@/app/(subsystems)/info/components/admin/AdminDiscussionModeration';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import { supabase } from '@/lib/supabase';
import { notifyToast } from '@/lib/toast.mjs';

const CATEGORIES_PER_PAGE = 6;

export default function AdminForumPage({ initialStatus = 'all' } = {}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('threads');
  const initialStatusRef = useRef(initialStatus);
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
  const [customCategories, setCustomCategories] = useState([]);
  const [categoryPage, setCategoryPage] = useState(1);
  const [newCategory, setNewCategory] = useState('');

  const showToast = (message, isError = false) => {
    setToastMessage(null);
    notifyToast(message, isError ? 'error' : undefined);
  };

  const fetchThreads = async (requestedStatus = statusFilter) => {
    try {
      let query = '/info/api/admin/forum';
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (requestedStatus !== 'all') params.append('status', requestedStatus);
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

  const fetchCategories = async () => {
    try {
      const response = await fetch('/info/api/admin/forum/categories', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load forum categories');
      setCustomCategories(result.categories || []);
    } catch (error) {
      console.error('Forum categories load failed:', error);
      showToast(error.message || 'Unable to load forum categories.', true);
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

      const reportRows = data || [];
      const replyIds = [...new Set(reportRows
        .filter((report) => report.reported_item_table === 'forum_replies')
        .map((report) => report.reported_item_id)
        .filter(Boolean))];
      const commentIds = [...new Set(reportRows
        .filter((report) => report.reported_item_table === 'content_comments')
        .map((report) => report.reported_item_id)
        .filter(Boolean))];
      const [repliesResult, commentsResult] = await Promise.all([
        replyIds.length
          ? supabase.from('forum_replies').select('id, thread_id').in('id', replyIds)
          : Promise.resolve({ data: [], error: null }),
        commentIds.length
          ? supabase.from('content_comments').select('id, content_type, content_id').in('id', commentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (repliesResult.error) throw repliesResult.error;
      if (commentsResult.error) throw commentsResult.error;

      const replyThreads = new Map((repliesResult.data || []).map((reply) => [reply.id, reply.thread_id]));
      const commentsById = new Map((commentsResult.data || []).map((comment) => [comment.id, comment]));
      const forumReports = reportRows.flatMap((report) => {
        const contentId = report.reported_item_id;
        if (!contentId) return [];

        if (report.reported_item_table === 'forum_threads') {
          return [{
            ...report,
            targetHref: `/info/user/forums/${encodeURIComponent(contentId)}`,
            targetLabel: 'View post',
          }];
        }

        if (report.reported_item_table === 'forum_replies') {
          const threadId = replyThreads.get(contentId);
          return threadId ? [{
            ...report,
            targetHref: `/info/user/forums/${encodeURIComponent(threadId)}#reply-${encodeURIComponent(contentId)}`,
            targetLabel: 'View reply',
          }] : [];
        }

        const comment = report.reported_item_table === 'content_comments'
          ? commentsById.get(contentId)
          : null;
        return comment?.content_type === 'forum_thread' ? [{
          ...report,
          targetHref: `/info/user/forums/${encodeURIComponent(comment.content_id)}`,
          targetLabel: 'View post',
        }] : [];
      });
      setReports(forumReports);
    } catch (err) {
      console.error('Error fetching moderation reports:', err);
      setReports([]);
      showToast(err.message || 'Unable to load forum reports.', true);
    }
  };

  const openCreateModal = () => {
    setEditingThread(null);
    setThreadForm({ title: '', content: '', status: 'published', category: customCategories[0]?.name || 'General' });
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
      const url = editingThread ? `/info/api/admin/forum/${editingThread.id}` : '/info/api/admin/forum';
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
      const res = await fetch(`/info/api/admin/forum/${thread.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to delete thread');
      showToast(data.notificationWarning || 'Thread deleted successfully!', Boolean(data.notificationWarning));
      await fetchThreads();
    } catch (err) {
      console.error('Error deleting forum thread:', err);
      showToast(err.message, true);
    }
  };

  const archiveThread = async (thread) => {
    try {
      const res = await fetch(`/info/api/admin/forum/${thread.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to archive thread');
      showToast('Thread archived successfully!');
      await fetchThreads();
    } catch (err) {
      console.error('Error archiving forum thread:', err);
      showToast(err.message, true);
    }
  };

  const reviewPendingThread = async (thread, decision) => {
    const reason = window.prompt(
      decision === 'approve' ? 'Approval note:' : 'Reason for rejecting this submission:'
    )?.trim();
    if (!reason) return;

    try {
      const response = await fetch('/info/api/admin/moderation', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-submission',
          submissionId: thread.id,
          tableName: 'forum_threads',
          decision,
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to review this submission.');
      showToast(decision === 'approve' ? 'Forum submission approved.' : 'Forum submission rejected.');
      await fetchThreads();
    } catch (error) {
      console.error('Forum submission review failed:', error);
      showToast(error.message || 'Unable to review this submission.', true);
    }
  };

  const toggleLock = async (thread) => {
    try {
      const response = await fetch(`/info/api/admin/forum/${thread.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: thread.status === 'closed' ? 'published' : 'closed' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update thread lock.');
      showToast(thread.status === 'closed' ? 'Thread unlocked.' : 'Thread locked.');
      await fetchThreads();
    } catch (error) {
      showToast(error.message || 'Unable to update thread lock.', true);
    }
  };

  const pinThread = async (thread) => {
    try {
      const response = await fetch(`/info/api/admin/forum/${thread.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !thread.pinned }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update pinned status');
      showToast(thread.pinned ? 'Thread unpinned.' : 'Thread pinned.');
      await fetchThreads();
    } catch (error) {
      showToast(error.message || 'Unable to update pinned status.', true);
    }
  };

  const addCategory = async () => {
    const value = newCategory.trim();
    if (!value) return;
    try {
      const response = await fetch('/info/api/admin/forum/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to add category');
      setCustomCategories((previous) => [...previous, result.category]);
      setNewCategory('');
      setCategoryPage(1);
      showToast('Category added.');
    } catch (error) {
      showToast(error.message || 'Unable to add category.', true);
    }
  };

  const editCategory = async (category) => {
    const name = window.prompt('Edit category name:', category.name)?.trim();
    if (!name || name === category.name) return;
    try {
      const response = await fetch(`/info/api/admin/forum/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: category.description || '' }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update category.');
      setCustomCategories((previous) => previous.map((item) => item.id === category.id ? result.category : item));
      setThreads((previous) => previous.map((thread) => thread.category_id === category.id ? { ...thread, category: result.category.name } : thread));
      showToast('Category updated.');
    } catch (error) {
      showToast(error.message || 'Unable to update category.', true);
    }
  };

  const deleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    try {
      const response = await fetch(`/info/api/admin/forum/categories/${category.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to delete category.');
      setCustomCategories((previous) => previous.filter((item) => item.id !== category.id));
      showToast('Category deleted.');
    } catch (error) {
      showToast(error.message || 'Unable to delete category.', true);
    }
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
      pinned: threads.filter((thread) => thread.pinned).length,
      reports: reports.length,
    };
  }, [threads, reports]);

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchesSearch = !searchTerm || (thread.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || thread.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || (thread.category || 'General') === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [threads, searchTerm, statusFilter, categoryFilter]);
  const categoryPageCount = Math.max(1, Math.ceil(customCategories.length / CATEGORIES_PER_PAGE));
  const currentCategoryPage = Math.min(categoryPage, categoryPageCount);
  const visibleCategories = customCategories.slice(
    (currentCategoryPage - 1) * CATEGORIES_PER_PAGE,
    currentCategoryPage * CATEGORIES_PER_PAGE,
  );

  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) return window.location.assign('/info/login');
      const sessionUser = JSON.parse(session);
      if (!hasAdminAccess(sessionUser.role)) return window.location.assign('/info/admin/dashboard');
      setUser(sessionUser);
      const searchParams = new URLSearchParams(window.location.search);
      const requestedView = searchParams.get('view');
      if (['threads', 'categories', 'reports'].includes(requestedView)) setActiveSection(requestedView);
      const requestedStatus = initialStatusRef.current === 'pending' || searchParams.get('status') === 'pending'
        ? 'pending'
        : 'all';
      setStatusFilter(requestedStatus);
      await fetchThreads(requestedStatus);
      await fetchCategories();
      await fetchReports();
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return <AdminPageSkeleton variant="table" rows={6} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Community"
          title={initialStatus === 'pending' ? 'Forum submissions' : 'Forum moderation'}
          description={initialStatus === 'pending'
            ? 'Review forum topics awaiting approval.'
            : activeSection === 'threads'
              ? 'Manage community threads and review submissions.'
            : activeSection === 'categories'
              ? 'Organize forum discussions into clear topics.'
              : 'Review reports submitted about forum discussions.'}
          icon="forum"
          actions={activeSection === 'threads' ? (
            <AdminButton variant="primary" icon="plus" onClick={openCreateModal}>Create thread</AdminButton>
          ) : null}
        />

        <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-2" role="tablist" aria-label="Forum moderation sections">
          {[
            { id: 'threads', label: 'Threads' },
            { id: 'categories', label: 'Categories' },
            { id: 'reports', label: 'Report queue', count: stats.reports },
          ].map((section) => (
            <button
              key={section.id}
              id={`forum-${section.id}-tab`}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls={`forum-${section.id}-panel`}
              onClick={() => setActiveSection(section.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeSection === section.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {section.label}
              {section.count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  activeSection === section.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {section.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeSection === 'threads' && (
          <div id="forum-threads-panel" role="tabpanel" aria-labelledby="forum-threads-tab" className="space-y-6">
            <AdminStatGrid columns={4}>
              <AdminStatCard label="Threads" value={stats.total} icon="forum" tone="brand" />
              <AdminStatCard label="Active" value={stats.active} icon="check" tone="success" />
              <AdminStatCard label="Locked" value={stats.locked} icon="moderation" tone="danger" />
              <AdminStatCard label="Pinned" value={stats.pinned} icon="content" tone="violet" />
            </AdminStatGrid>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
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
                  <option value="draft">Draft</option>
                  <option value="pending">Pending review</option>
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-full rounded-2xl border border-gray-200 px-4 py-2">
                  <option value="all">All categories</option>
                  {customCategories.map((category) => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
                <button onClick={fetchThreads} className="rounded-2xl bg-gray-800 px-4 py-2 text-white hover:bg-gray-900">Refresh</button>
              </div>
            </div>

            <div className="grid min-w-0 content-start gap-4">
              {filteredThreads.length ? filteredThreads.map((thread) => (
              <article key={thread.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="break-words text-xl font-semibold text-gray-900">{thread.title}</h2>
                      {thread.pinned && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase text-amber-700">Pinned</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">{thread.reply_count || 0} replies</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium capitalize text-blue-700">{thread.status}</span>
                      <span className="rounded-full bg-gray-50 px-2.5 py-1 font-medium text-gray-600">{thread.category || 'General'}</span>
                    </div>
                </div>
                <p className="break-words rounded-xl bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-600 line-clamp-3">{thread.content}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>Created: {new Date(thread.created_at).toLocaleString()}</span>
                  <span>Last activity: {thread.last_activity_at ? new Date(thread.last_activity_at).toLocaleString() : '—'}</span>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {thread.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void reviewPendingThread(thread, 'approve')}
                        className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void reviewPendingThread(thread, 'reject')}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  <button onClick={() => pinThread(thread)} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-100">{thread.pinned ? 'Unpin' : 'Pin'}</button>
                  <button onClick={() => void toggleLock(thread)} className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-100">{thread.status === 'closed' ? 'Unlock' : 'Lock'}</button>
                  <button onClick={() => openViewModal(thread)} className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200">View</button>
                  <button onClick={() => openEditModal(thread)} className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100">Edit</button>
                  {thread.status !== 'archived' && <button onClick={() => archiveThread(thread)} className="rounded-lg bg-yellow-50 px-3 py-1.5 text-xs font-medium text-yellow-700 transition hover:bg-yellow-100">Archive</button>}
                  <button onClick={() => deleteThread(thread)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100">Delete</button>
                </div>
              </article>
            )) : (
              <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
                No forum threads found.
              </div>
            )}
          </div>
          </div>
        )}

        {activeSection === 'categories' && (
          <section id="forum-categories-panel" role="tabpanel" aria-labelledby="forum-categories-tab" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-bold text-gray-800">Forum categories</h2>
            <p className="mb-4 text-sm text-gray-500">Organize discussions into clear topics.</p>
            <div className="mb-5 flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void addCategory();
                }}
                placeholder="Add category"
                aria-label="New forum category"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              <button onClick={addCategory} className="shrink-0 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800">Add category</button>
            </div>
            {customCategories.length ? (
              <div className="mb-4 space-y-2">
                {visibleCategories.map((category) => (
                  <div key={category.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2">
                    <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-gray-700" title={category.name}>{category.name}</span>
                    <button
                      type="button"
                      onClick={() => void editCategory(category)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                      aria-label={`Edit ${category.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCategory(category)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                      aria-label={`Delete ${category.name}`}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No forum categories yet.</p>
            )}
            {customCategories.length > CATEGORIES_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  Showing {(currentCategoryPage - 1) * CATEGORIES_PER_PAGE + 1}–{Math.min(currentCategoryPage * CATEGORIES_PER_PAGE, customCategories.length)} of {customCategories.length} categories
                </p>
                <nav className="flex items-center gap-2" aria-label="Forum category pagination">
                  <button
                    type="button"
                    onClick={() => setCategoryPage(Math.max(1, currentCategoryPage - 1))}
                    disabled={currentCategoryPage === 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="min-w-20 text-center text-sm text-gray-600">
                    Page {currentCategoryPage} of {categoryPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategoryPage(Math.min(categoryPageCount, currentCategoryPage + 1))}
                    disabled={currentCategoryPage === categoryPageCount}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
          </section>
        )}

        {activeSection === 'reports' && (
          <section id="forum-reports-panel" role="tabpanel" aria-labelledby="forum-reports-tab" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Forum report queue</h2>
                <p className="mt-1 text-sm text-gray-500">Recent reports about community discussions.</p>
              </div>
              <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{stats.reports}</span>
            </div>
            <div className="space-y-3">
              {reports.length ? reports.map((report) => (
                <article key={report.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase text-red-600">{report.report_type}</span>
                    <span className="text-[10px] uppercase text-gray-500">{report.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-800">{report.reason}</p>
                  <p className="mt-1 text-xs text-gray-500">{report.description || 'No additional details provided.'}</p>
                  <Link
                    href={report.targetHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    {report.targetLabel}
                  </Link>
                </article>
              )) : (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No forum reports to display.</p>
              )}
            </div>
          </section>
        )}
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

            <div className="space-y-2">
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
                    <option key={category.id} value={category.name}>{category.name}</option>
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
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3 sm:p-5" role="presentation">
          <section className="max-h-[94vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="forum-thread-preview-title">
            <header className="flex items-center justify-between gap-4 border-b border-gray-200 p-5">
              <h3 id="forum-thread-preview-title" className="break-words text-xl font-semibold text-gray-900">{selectedThread.title}</h3>
              <button type="button" onClick={closeViewModal} className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Close</button>
            </header>
            <div className="max-h-[calc(94vh-5rem)] overflow-y-auto p-5">
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{selectedThread.content}</p>
              <AdminDiscussionModeration key={`forum:${selectedThread.id}`} contentType="forum_thread" contentId={selectedThread.id} />
            </div>
          </section>
        </div>
      )}

      {toastMessage && (
        <div role={toastMessage.isError ? 'alert' : 'status'} aria-live={toastMessage.isError ? 'assertive' : 'polite'} className={`admin-toast ${toastMessage.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
