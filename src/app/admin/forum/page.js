'use client'

import { useEffect, useState } from 'react'
import AdminSidebar from '@/app/components/AdminSidebar'
import { hasAdminAccess } from '@/lib/adminRoles'

export default function AdminForumPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingThread, setEditingThread] = useState(null)
  const [selectedThread, setSelectedThread] = useState(null)
  const [threadForm, setThreadForm] = useState({ title: '', content: '', status: 'published' })
  const [toastMessage, setToastMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError })
    setTimeout(() => setToastMessage(null), 3000)
  }

  const fetchThreads = async () => {
    try {
      let query = '/api/admin/forum'
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if ([...params].length) query += `?${params.toString()}`

      const res = await fetch(query)
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to load threads')
      setThreads(data.threads || [])
    } catch (err) {
      console.error('Error fetching forum threads:', err)
      showToast(err.message, true)
    }
  }

  const openCreateModal = () => {
    setEditingThread(null)
    setThreadForm({ title: '', content: '', status: 'published' })
    setShowModal(true)
  }

  const openEditModal = (thread) => {
    setEditingThread(thread)
    setThreadForm({ title: thread.title || '', content: thread.content || '', status: thread.status || 'published' })
    setShowModal(true)
  }

  const saveThread = async () => {
    if (!threadForm.title.trim() || !threadForm.content.trim()) {
      showToast('Title and content are required.', true)
      return
    }

    setSaving(true)
    try {
      const method = editingThread ? 'PUT' : 'POST'
      const url = editingThread ? `/api/admin/forum/${editingThread.id}` : '/api/admin/forum'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: threadForm.title,
          content: threadForm.content,
          status: threadForm.status,
          created_by: editingThread ? undefined : user?.id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to save thread')

      showToast(editingThread ? 'Thread updated successfully!' : 'Thread created successfully!')
      setShowModal(false)
      setEditingThread(null)
      fetchThreads()
    } catch (err) {
      console.error('Error saving forum thread:', err)
      showToast(err.message, true)
    } finally {
      setSaving(false)
    }
  }

  const deleteThread = async (thread) => {
    if (!confirm(`Delete thread "${thread.title}"?`)) return

    try {
      const res = await fetch(`/api/admin/forum/${thread.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to delete thread')
      showToast('Thread deleted successfully!')
      fetchThreads()
    } catch (err) {
      console.error('Error deleting forum thread:', err)
      showToast(err.message, true)
    }
  }

  const openViewModal = (thread) => {
    setSelectedThread(thread)
  }

  const closeViewModal = () => {
    setSelectedThread(null)
  }

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session')
      if (!session) return window.location.assign('/login')
      const sessionUser = JSON.parse(session)
      if (!hasAdminAccess(sessionUser.role)) return window.location.assign('/dashboard')
      setUser(sessionUser)
      await fetchThreads()
      setLoading(false)
    }
    checkAuth()
  }, [searchTerm, statusFilter])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />
      <div className="ml-64 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Forum Management</h1>
            <p className="text-gray-500 mt-1">Create, review, and manage forum discussion threads.</p>
          </div>
          <button onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700">
            <span>+</span>
            <span>Create thread</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
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
            <button onClick={fetchThreads} className="rounded-2xl bg-gray-800 px-4 py-2 text-white hover:bg-gray-900">Refresh</button>
          </div>
        </div>

        {toastMessage && (
          <div className={`mb-6 rounded-2xl px-4 py-3 text-sm ${toastMessage.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {toastMessage.message}
          </div>
        )}

        <div className="grid gap-4">
          {threads.length ? threads.map((thread) => (
            <div key={thread.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{thread.title}</h2>
                  <p className="mt-1 text-sm text-gray-500">{thread.reply_count || 0} replies · {thread.status}</p>
                </div>
                <div className="flex flex-wrap gap-2">
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
              No forum threads found. Create the first thread to get started.
            </div>
          )}
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
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
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
    </div>
  )
}
