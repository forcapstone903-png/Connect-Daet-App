'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  MessageSquareMore,
  Pencil,
  Send,
  ShieldAlert,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import MediaUpload from '@/app/components/MediaUpload'
import { supabase } from '@/lib/supabase'
import { getStoredSession } from '@/lib/authCookies'
import UserSectionHeader, { SectionTabs } from '@/app/components/user/UserSectionHeader'
import UserTopHeader from '@/app/components/user/UserTopHeader'

function readStoredSession() {
  if (typeof window === 'undefined') return null

  try {
    const raw = getStoredSession()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const FEEDBACK_CATEGORIES = ['suggestion', 'praise', 'inquiry']
const COMPLAINT_CATEGORIES = ['cleanliness', 'safety', 'infrastructure', 'service']
const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  open: 'bg-amber-100 text-amber-700 border-amber-200',
  answered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-200 text-slate-700 border-slate-300',
}

function formatDate(dateValue) {
  if (!dateValue) return 'Recently'
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UserFeedbackPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submissions, setSubmissions] = useState([])
  const [kind, setKind] = useState('feedback')
  const [form, setForm] = useState({
    category: 'suggestion',
    title: '',
    message: '',
    rating: 5,
    images: [],
  })
  const [editingId, setEditingId] = useState(null)
  const [editingTable, setEditingTable] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

  useEffect(() => {
    const currentSession = readStoredSession()
    setSession(currentSession)

    if (currentSession) {
      loadSubmissions(currentSession)
    } else {
      setLoading(false)
    }
  }, [])

  const loadSubmissions = async (currentSession) => {
    const currentUserId = currentSession?.user_id || currentSession?.id || currentSession?.userId || currentSession?.sub || ''
    if (!currentUserId) {
      setLoading(false)
      return
    }

    try {
      const [feedbackResult, complaintResult] = await Promise.all([
        supabase.from('info_feedback').select('*').eq('user_id', currentUserId).order('created_at', { ascending: false }),
        supabase.from('info_inquiries').select('*').eq('user_id', currentUserId).order('created_at', { ascending: false }),
      ])

      const merged = [
        ...(feedbackResult.data || []).map((item) => ({ ...item, kind: 'feedback', table: 'info_feedback' })),
        ...(complaintResult.data || []).map((item) => ({ ...item, kind: 'complaint', table: 'info_inquiries' })),
      ]

      setSubmissions(merged)
    } catch (error) {
      console.error('Failed to load user feedback:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (kind === 'feedback') {
      setForm((previous) => ({ ...previous, category: FEEDBACK_CATEGORIES[0], title: previous.title || 'General feedback' }))
    } else {
      setForm((previous) => ({ ...previous, category: COMPLAINT_CATEGORIES[0], title: previous.title || 'Complaint regarding the location' }))
    }
  }, [kind])

  const submitFeedback = async (event) => {
    event.preventDefault()
    if (!userId) {
      setNotice('Please sign in to submit feedback or a complaint.')
      return
    }

    if (!form.message.trim()) {
      setNotice('Please tell us a bit more about your feedback.')
      return
    }

    setSaving(true)
    setNotice('')

    try {
      const payload = {
        shareType: kind === 'feedback' ? 'feedback' : 'complaint',
        feedbackForm: kind === 'feedback'
          ? {
              title: form.title || 'General feedback',
              message: form.message,
              category: form.category,
              rating: form.rating,
            }
          : null,
        complaintForm: kind === 'complaint'
          ? {
              title: form.title || 'Complaint submission',
              message: form.message,
              category: form.category,
              images: Array.isArray(form.images) ? form.images : [],
            }
          : null,
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Unable to save the form right now.')
      }

      setNotice(kind === 'feedback' ? 'Feedback saved successfully.' : 'Complaint submitted successfully.')
      setForm({ category: kind === 'feedback' ? FEEDBACK_CATEGORIES[0] : COMPLAINT_CATEGORIES[0], title: '', message: '', rating: 5, images: [] })
      setEditingId(null)
      setEditingTable(null)
      await loadSubmissions({ user_id: userId })
    } catch (error) {
      console.error('Submission failed:', error)
      setNotice(error?.message || 'Unable to save the form right now.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item) => {
    setKind(item.kind)
    setEditingId(item.id)
    setEditingTable(item.table)
    setForm({
      category: item.category,
      title: item.title || '',
      message: item.comments || item.message || '',
      rating: item.rating || 5,
      images: item.image_urls || item.images || [],
    })
    setNotice('Editing existing submission.')
  }

  const handleDelete = async (item) => {
    if (!item?.id) return

    try {
      const { error } = await supabase.from(item.table).delete().eq('id', item.id)
      if (error) throw error
      setSubmissions((previous) => previous.filter((submission) => submission.id !== item.id))
      setNotice('Submission deleted successfully.')
    } catch (error) {
      console.error('Delete failed:', error)
      setNotice('Unable to delete this submission right now.')
    }
  }

  const stats = useMemo(() => {
    const total = submissions.length
    const pending = submissions.filter((item) => ['pending', 'open'].includes(item.status)).length
    const inProgress = submissions.filter((item) => ['in_progress', 'answered'].includes(item.status)).length
    const resolved = submissions.filter((item) => ['resolved', 'closed'].includes(item.status)).length

    return { total, pending, inProgress, resolved }
  }, [submissions])

  return (
    <main className="tourism-shell usr-section-page usr-support min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-5xl px-3 pb-24 pt-2 sm:px-4 lg:px-6">
        <UserSectionHeader
          eyebrow="Support"
          title="Feedback & complaints"
          description="Tell us what is working, what is not, and what the Daet community needs next."
          emoji="📮"
        >
          <span className="usr-section-counter">{stats.total} submission{stats.total === 1 ? '' : 's'}</span>
          <Link href="/user/notifications" className="usr-section-secondary">
            <BellRing className="h-4 w-4" />
            Notifications
          </Link>
        </UserSectionHeader>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {[
            { label: 'Total', value: stats.total, icon: MessageSquareMore, tone: 'usr-tone-sky' },
            { label: 'Pending', value: stats.pending, icon: AlertCircle, tone: 'usr-tone-amber' },
            { label: 'In progress', value: stats.inProgress, icon: CheckCircle2, tone: 'usr-tone-violet' },
            { label: 'Resolved', value: stats.resolved, icon: ShieldAlert, tone: 'usr-tone-emerald' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`usr-stat-tile usr-card usr-enter ${tone}`}>
              <div className="min-w-0">
                <p className="usr-stat-label">{label}</p>
                <p className="usr-stat-value">{value}</p>
              </div>
              <span className="usr-stat-icon" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="usr-card usr-enter p-4 sm:p-5">
            <SectionTabs
              label="Submission type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'feedback', label: 'Submit feedback' },
                { value: 'complaint', label: 'Submit complaint' },
              ]}
            />

            <form onSubmit={submitFeedback} className="space-y-4">
              {kind === 'complaint' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Complaint subject</label>
                  <input
                    value={form.title}
                    onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                    placeholder="Example: Unsafe lighting near the public park"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                <select
                  value={form.category}
                  onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white"
                >
                  {(kind === 'feedback' ? FEEDBACK_CATEGORIES : COMPLAINT_CATEGORIES).map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows={6}
                  value={form.message}
                  onChange={(event) => setForm((previous) => ({ ...previous, message: event.target.value }))}
                  placeholder={kind === 'feedback' ? 'Share your idea, praise, or inquiry...' : 'Describe the issue, its location, and any impact on you...'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white"
                />
              </div>

              {kind === 'feedback' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Rate your experience</label>
                  <div className="flex items-center gap-2">
                    {[1,2,3,4,5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setForm((previous) => ({ ...previous, rating }))}
                        className={`rounded-full p-2 transition ${form.rating >= rating ? 'text-amber-500' : 'text-slate-300'}`}
                        aria-label={`Rate ${rating} star${rating > 1 ? 's' : ''}`}
                      >
                        <Star className="h-5 w-5 fill-current" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Attach photo</p>
                <div className="flex flex-wrap gap-3">
                  {form.images.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <img src={url} alt={`Attachment ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">
                    <MediaUpload
                      bucket="profile-media"
                      folder={userId ? `feedback/${userId}` : 'feedback'}
                      mediaType="image"
                      buttonText="Upload"
                      onUploadComplete={(url) => setForm((previous) => ({ ...previous, images: [...(previous.images || []), url].slice(0, 4) }))}
                      onUploadError={(message) => setNotice(message)}
                    />
                  </div>
                </div>
              </div>

              {notice ? <p role="status" className="usr-inline-note usr-inline-note-info">{notice}</p> : null}

              <button
                type="submit"
                disabled={saving}
                className="usr-section-primary w-full sm:w-auto"
              >
                <Send className="h-4 w-4" />
                {saving ? 'Saving...' : editingId ? 'Update submission' : kind === 'feedback' ? 'Send feedback' : 'Submit complaint'}
              </button>
            </form>
          </section>

          <aside className="usr-stagger space-y-6">
            <div className="usr-card usr-enter p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700">History</p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">My submissions</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{submissions.length}</span>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="usr-inline-note usr-inline-note-info">
                    Loading submissions...
                  </div>
                ) : submissions.length ? (
                  submissions.map((item) => (
                    <div key={`${item.table}-${item.id}`} className="usr-lift rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.kind === 'complaint' ? (item.title || 'Complaint') : 'Feedback'}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.category}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${STATUS_STYLES[item.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {item.status || 'pending'}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{item.comments || item.message}</p>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span>{formatDate(item.created_at)}</span>
                        <span>{item.kind === 'complaint' ? 'Complaint' : 'Feedback'}</span>
                      </div>

                      {item.admin_response ? (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
                          <span className="font-semibold">Admin response:</span> {item.admin_response}
                        </div>
                      ) : null}

                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => handleEdit(item)} className="usr-press inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(item)} className="usr-press inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100">
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    No submissions yet. Share your experience to begin.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
