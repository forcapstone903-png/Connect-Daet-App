'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpenText, CheckCircle2, Clock3, FilePenLine, MessageSquareText, Plus, XCircle } from 'lucide-react'
import UserSectionHeader from '@/app/(subsystems)/info/components/user/UserSectionHeader'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'

const STATUS_DETAILS = {
  pending: { label: 'Pending approval', Icon: Clock3, classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: 'Approved', Icon: CheckCircle2, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', Icon: XCircle, classes: 'bg-rose-50 text-rose-700 border-rose-200' },
  changes_requested: { label: 'Changes requested', Icon: MessageSquareText, classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  draft: { label: 'Draft', Icon: FilePenLine, classes: 'bg-slate-50 text-slate-600 border-slate-200' },
}

export default function BlogSubmissionsPage() {
  const [blogs, setBlogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const loadBlogs = async () => {
      try {
        const response = await fetch('/info/api/user/blogs', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load your blog posts.')
        }
        if (active) setBlogs(result.blogs || [])
      } catch (loadError) {
        console.error('Blog submissions load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load your blog posts.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadBlogs()
    return () => { active = false }
  }, [])

  return (
    <main className="tourism-shell usr-section-page min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-3xl px-3 pb-24 pt-2 sm:px-5 lg:px-6">
        <UserSectionHeader
          eyebrow="Writing studio"
          title="My blog posts"
          description="Track each post from draft through staff review and publication."
          emoji="📝"
          hideMobileTitle
          backHref="/info/user/dashboard"
          backLabel="Community stories"
        >
          <Link href="/info/user/blogs/new" className="usr-section-primary"><Plus className="h-4 w-4" />New post</Link>
        </UserSectionHeader>

        {error ? <p role="alert" className="usr-inline-note usr-inline-note-error">{error}</p> : null}

        {loading ? (
          <div className="space-y-3" aria-label="Loading your posts">
            {[0, 1, 2].map((item) => <div key={item} className="usr-section-skeleton h-24 rounded-2xl" />)}
          </div>
        ) : blogs.length ? (
          <div className="usr-stagger space-y-3">
            {blogs.map((blog) => {
              const status = STATUS_DETAILS[blog.approval_status] || STATUS_DETAILS.draft
              const StatusIcon = status.Icon
              return (
                <article key={blog.id} className="usr-card flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
                  {blog.featured_image ? (
                    <img src={blog.featured_image} alt="" className="h-24 w-full shrink-0 rounded-xl object-cover sm:h-20 sm:w-28" />
                  ) : (
                    <span className="flex h-20 w-full shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 sm:w-28"><BookOpenText className="h-7 w-7" /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${status.classes}`}>
                        <StatusIcon className="h-3.5 w-3.5" />{status.label}
                      </span>
                      {blog.category ? <span className="text-xs font-semibold capitalize text-slate-500">{String(blog.category).replace(/[_-]/g, ' ')}</span> : null}
                    </div>
                    <h2 className="mt-2 break-words text-base font-bold text-slate-900">{blog.title || 'Untitled post'}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{blog.excerpt || 'No excerpt provided.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {blog.approval_status === 'approved'
                        ? `Approved ${blog.reviewed_at ? new Date(blog.reviewed_at).toLocaleDateString() : ''}`
                        : blog.approval_status === 'rejected'
                          ? `Reviewed ${blog.reviewed_at ? new Date(blog.reviewed_at).toLocaleDateString() : ''}`
                          : blog.approval_status === 'changes_requested'
                            ? `Feedback received ${blog.reviewed_at ? new Date(blog.reviewed_at).toLocaleDateString() : ''}`
                          : blog.approval_status === 'pending'
                            ? `Submitted ${blog.submitted_at ? new Date(blog.submitted_at).toLocaleDateString() : 'recently'}`
                            : `Updated ${blog.updated_at ? new Date(blog.updated_at).toLocaleDateString() : 'recently'}`}
                    </p>
                    {['rejected', 'changes_requested'].includes(blog.approval_status) && blog.rejection_reason ? (
                      <p className={`mt-3 rounded-xl border p-3 text-sm leading-6 ${blog.approval_status === 'changes_requested' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                        <strong>Review feedback:</strong> {blog.rejection_reason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    {blog.approval_status === 'approved' ? (
                      <Link href={`/info/user/blogs/${blog.id}`} className="usr-section-secondary">View post</Link>
                    ) : (
                      <Link href={`/info/user/blogs/${blog.id}/edit`} className="usr-section-secondary">
                        <FilePenLine className="h-4 w-4" />{['rejected', 'changes_requested'].includes(blog.approval_status) ? 'Edit & resubmit' : 'Edit'}
                      </Link>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="usr-empty-state usr-pop-in">
            <BookOpenText className="mx-auto h-9 w-9 text-slate-300" />
            <h2 className="mt-3 text-base font-bold text-slate-800">No blog posts yet</h2>
            <p className="mt-1 text-sm text-slate-500">Drafts and submitted posts will appear here with their review status.</p>
            <Link href="/info/user/blogs/new" className="usr-section-primary mt-5 inline-flex">Create your first post</Link>
          </div>
        )}
      </div>
    </main>
  )
}
