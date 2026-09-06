'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, Save, MessageSquare, CalendarDays, MessageCircle, FilePenLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import MediaUpload from '@/app/components/MediaUpload'
import { trackUserActivity } from '@/lib/trackActivity'
import { getStoredSessionObject } from '@/lib/authCookies'
import MobileNav from '@/app/components/user/MobileNav'

const categories = [
  { value: 'travel_guides', label: 'Travel Guides' },
  { value: 'cultural_insights', label: 'Cultural Insights' },
  { value: 'food', label: 'Food' },
  { value: 'history', label: 'History' },
  { value: 'events', label: 'Events' },
  { value: 'announcement', label: 'Announcements' },
]

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  category: 'travel_guides',
  featured_image: '',
  tags: '',
  status: 'draft',
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function CreateBlogPage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY_FORM)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [shareType, setShareType] = useState('blog')
  const [forumForm, setForumForm] = useState({ title: '', content: '', tags: '' })
  const [eventForm, setEventForm] = useState({ title: '', description: '', location: '', start_date: '', category: 'festival' })
  const [feedbackForm, setFeedbackForm] = useState({ category: 'suggestion', message: '', rating: 5 })

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession()
      const storedSession = getStoredSessionObject()
      const user = data.session?.user || (storedSession?.user_id || storedSession?.id || storedSession?.sub || storedSession?.userId
        ? { id: storedSession.user_id || storedSession.id || storedSession.sub || storedSession.userId, email: storedSession.email || storedSession.user_email }
        : null)
      setSession(user ? { user } : null)
      setLoading(false)
    }

    getSession()
  }, [])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!session?.user) {
      alert('Please log in before creating a blog article.')
      return
    }

    if (!form.title.trim() || !form.content.trim() || !form.category) {
      alert('Please add a title, category, and article content.')
      return
    }

    setSubmitting(true)

    try {
      if (shareType !== 'blog') {
        let error = null

        if (shareType === 'forum') {
          if (!forumForm.title.trim() || !forumForm.content.trim()) throw new Error('Please add a discussion title and message.')
          const tags = forumForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
          const result = await supabase.from('forum_threads').insert({ title: forumForm.title.trim(), content: forumForm.content.trim(), tags, status: 'active', created_by: session.user.id })
          error = result.error
        } else if (shareType === 'event') {
          if (!eventForm.title.trim() || !eventForm.description.trim() || !eventForm.start_date) throw new Error('Please add an event title, description, and date.')
          const result = await supabase.from('info_events').insert({ title: eventForm.title.trim(), description: eventForm.description.trim(), location: eventForm.location.trim() || null, start_date: eventForm.start_date, category: eventForm.category, status: 'published', published_at: new Date().toISOString(), created_by: session.user.id })
          error = result.error
        } else {
          if (!feedbackForm.message.trim()) throw new Error('Please add your feedback message.')
          const result = await supabase.from('info_feedback').insert({ user_id: session.user.id, category: feedbackForm.category, rating: feedbackForm.rating, status: 'pending', comments: feedbackForm.message.trim(), target_type: 'system', target_id: session.user.id })
          error = result.error
        }

        if (error) throw error
        setSuccess(true)
        const destination = shareType === 'forum' ? '/user/forums' : shareType === 'event' ? '/user/events' : '/user/feedback'
        setTimeout(() => router.push(destination), 1200)
        return
      }

      const slug = `${generateSlug(form.title)}-${Date.now()}`
      const tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const payload = {
        title: form.title.trim(),
        slug,
        excerpt: form.excerpt.trim() || form.content.trim().slice(0, 180),
        content: form.content.trim(),
        featured_image: form.featured_image.trim() || null,
        category: form.category,
        tags,
        status: form.status,
      }

      const response = await fetch('/api/user/blogs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to create your blog article.')

      // Activity tracking is secondary; it must not block a successful post.
      void trackUserActivity({
        userId: session.user.id,
        activityType: 'new_post',
        entityType: 'blog',
        description: `Published a new blog post: ${form.title.trim()}`,
        metadata: {
          contentTitle: form.title.trim(),
          ownerUserId: session.user.id,
        },
      }).catch((activityError) => {
        console.warn('Blog activity tracking failed:', activityError)
      })

      setSuccess(true)
      setTimeout(() => {
        router.push(form.status === 'published' ? '/user/blogs' : '/user/drafts')
      }, 1200)
    } catch (error) {
      console.error('Error creating blog:', error)
      alert(error.message || 'Unable to create your blog article right now.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="mt-5 h-16 animate-pulse rounded bg-slate-200" />
        </div>
      </main>
    )
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-[#f3f5f9] px-3 py-6 sm:px-4 lg:px-6">
        <div className="mx-auto max-w-xl rounded-[24px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Restricted</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Log in to publish an article</h1>
          <p className="mt-3 text-slate-600">You need an active account before creating a blog post for the community.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/user/dashboard" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Back
            </Link>
            <Link href="/login" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              Log in
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f5f9] pb-24 text-slate-900">
      <MobileNav />
      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/user/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 border border-sky-200">
            <FileText className="h-3.5 w-3.5" />
            Create Post
          </div>
          <Link href="/user/drafts" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <FilePenLine className="h-3.5 w-3.5" />
            Drafts
          </Link>
        </div>

        <div className="mb-6 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-sky-600" />
            <h2 className="text-sm font-black text-slate-900">Choose what to share</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setShareType('blog')} className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${shareType === 'blog' ? 'border-sky-300 bg-sky-100 text-sky-800 ring-2 ring-sky-100' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'}`}><FileText className="mb-2 h-4 w-4" />Blog post</button>
            <button type="button" onClick={() => setShareType('forum')} className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${shareType === 'forum' ? 'border-emerald-300 bg-emerald-100 text-emerald-800 ring-2 ring-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}><MessageCircle className="mb-2 h-4 w-4" />Forum discussion</button>
            <button type="button" onClick={() => setShareType('event')} className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${shareType === 'event' ? 'border-amber-300 bg-amber-100 text-amber-800 ring-2 ring-amber-100' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'}`}><CalendarDays className="mb-2 h-4 w-4" />Create event</button>
            <button type="button" onClick={() => setShareType('feedback')} className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${shareType === 'feedback' ? 'border-violet-300 bg-violet-100 text-violet-800 ring-2 ring-violet-100' : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}><MessageSquare className="mb-2 h-4 w-4" />Share feedback</button>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">New article</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Share something with the community</h1>
          </div>

          {success ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Your {shareType} has been submitted successfully.</span>
            </div>
          ) : shareType === 'blog' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Title</span>
                  <input
                    value={form.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="e.g. Hidden food gems in San Fernando"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Short excerpt</span>
                  <textarea
                    value={form.excerpt}
                    onChange={(event) => updateField('excerpt', event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="A quick summary that shows up in previews."
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Category</span>
                  <select
                    value={form.category}
                    onChange={(event) => updateField('category', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                  >
                    {categories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => updateField('status', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Publish immediately</option>
                  </select>
                </label>

                <div className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Featured image</span>
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <MediaUpload
                      bucket="blogs"
                      folder="images"
                      mediaType="image"
                      existingMediaUrl={form.featured_image}
                      onUploadComplete={(url) => updateField('featured_image', url || '')}
                      onUploadError={(error) => alert(error)}
                      buttonText="Upload image"
                      maxSizeMB={5}
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Or paste an image URL</label>
                      <input
                        value={form.featured_image}
                        onChange={(event) => updateField('featured_image', event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-300"
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>
                  </div>
                </div>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => updateField('tags', event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="culture, local-guide, food"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-slate-700">Content</span>
                  <textarea
                    value={form.content}
                    onChange={(event) => updateField('content', event.target.value)}
                    rows={12}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:bg-white"
                    placeholder="Write the full article here..."
                  />
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <Link href="/user/blogs" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {submitting ? 'Publishing...' : form.status === 'published' ? 'Publish Article' : 'Save Draft'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {shareType === 'forum' && (
                <>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Discussion title</span><input value={forumForm.title} onChange={(event) => setForumForm((current) => ({ ...current, title: event.target.value }))} placeholder="What would you like to discuss?" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Message</span><textarea rows={8} value={forumForm.content} onChange={(event) => setForumForm((current) => ({ ...current, content: event.target.value }))} placeholder="Share your question, tip, or story..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Tags</span><input value={forumForm.tags} onChange={(event) => setForumForm((current) => ({ ...current, tags: event.target.value }))} placeholder="travel, tips, food" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                </>
              )}
              {shareType === 'event' && (
                <>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Event title</span><input value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Name your event" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Description</span><textarea rows={6} value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Tell the community about the event..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Date</span><input type="date" value={eventForm.start_date} onChange={(event) => setEventForm((current) => ({ ...current, start_date: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label><label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Location</span><input value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} placeholder="Daet, Camarines Norte" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label></div>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Category</span><select value={eventForm.category} onChange={(event) => setEventForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white"><option value="festival">Festival</option><option value="cultural">Cultural</option><option value="workshop">Workshop</option><option value="sports">Sports</option><option value="other">Other</option></select></label>
                </>
              )}
              {shareType === 'feedback' && (
                <>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Feedback type</span><select value={feedbackForm.category} onChange={(event) => setFeedbackForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white"><option value="suggestion">Suggestion</option><option value="praise">Praise</option><option value="inquiry">Inquiry</option></select></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Your feedback</span><textarea rows={8} value={feedbackForm.message} onChange={(event) => setFeedbackForm((current) => ({ ...current, message: event.target.value }))} placeholder="Tell us how we can improve Daet Connect..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white" /></label>
                  <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-700">Rating</span><select value={feedbackForm.rating} onChange={(event) => setFeedbackForm((current) => ({ ...current, rating: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-sky-300 focus:bg-white"><option value={5}>5 - Excellent</option><option value={4}>4 - Good</option><option value={3}>3 - Fair</option><option value={2}>2 - Needs improvement</option><option value={1}>1 - Poor</option></select></label>
                </>
              )}
              <div className="flex justify-end border-t border-slate-200 pt-5"><button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"><Save className="h-4 w-4" />{submitting ? 'Submitting...' : `Submit ${shareType}`}</button></div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
