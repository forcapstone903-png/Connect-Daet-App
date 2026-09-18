'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FilePenLine, Plus, Clock3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import UserTopHeader from '@/app/components/user/UserTopHeader'

export default function UserDraftsPage() {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadDrafts = async () => {
      const session = getStoredSessionObject()
      const userId = session?.user_id || session?.id || session?.sub || session?.userId

      if (!userId) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('info_blogs')
        .select('id, title, excerpt, category, updated_at, created_at')
        .eq('created_by', userId)
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })

      setDrafts(data || [])
      setLoading(false)
    }

    void loadDrafts()
  }, [])

  return (
    <main className="tourism-shell usr-section-page usr-drafts min-h-screen text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto max-w-3xl px-3 pb-24 pt-2 sm:px-5 lg:px-6">
        <UserSectionHeader
          eyebrow="Writing studio"
          title="Drafts"
          description="Unfinished stories are saved here. Pick one up whenever inspiration strikes."
          emoji="✒️"
          backHref="/user/blogs"
          backLabel="Community stories"
        >
          <span className="usr-section-counter">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
          <Link href="/user/blogs/new" className="usr-section-primary"><Plus className="h-4 w-4" />New post</Link>
        </UserSectionHeader>

        {loading ? (
          <div className="usr-section-loading">
            {[0, 1].map((item) => (
              <div key={item} className="usr-card flex items-center gap-4 p-4">
                <div className="usr-section-skeleton h-12 w-12 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-3">
                  <div className="usr-section-skeleton h-3 w-1/3 rounded-full" />
                  <div className="usr-section-skeleton h-3 w-3/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : drafts.length ? (
          <div className="usr-stagger space-y-3">
            {drafts.map((draft) => (
              <Link
                key={draft.id}
                href={`/user/blogs/${draft.id}/edit`}
                className="usr-list-row group block focus-visible:outline-none"
              >
                <article className="flex w-full min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600" aria-hidden="true">
                    <FilePenLine className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Draft</p>
                    <h2 className="mt-1 text-base font-black text-slate-900 group-hover:text-teal-700">{draft.title || 'Untitled draft'}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{draft.excerpt || 'No excerpt yet.'}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Updated {draft.updated_at ? new Date(draft.updated_at).toLocaleDateString() : 'recently'}
                    </p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        ) : (
          <div className="usr-empty-state usr-pop-in">
            <FilePenLine className="mx-auto h-9 w-9 text-slate-300" />
            <h2 className="mt-3 text-base font-bold text-slate-800">No drafts yet</h2>
            <p className="mt-1 text-sm text-slate-500">Save a blog post as a draft and it will appear here.</p>
            <Link href="/user/blogs/new" className="usr-section-primary mt-5 inline-flex">Create a draft</Link>
          </div>
        )}
      </div>
    </main>
  )
}