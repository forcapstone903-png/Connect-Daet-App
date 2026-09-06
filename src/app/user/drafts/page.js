'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, FilePenLine, Plus, Clock3 } from 'lucide-react'
import MobileNav from '@/app/components/user/MobileNav'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_35%,_#f1f5f9_100%)] pb-24 text-slate-900">
      <MobileNav />
      <div className="mx-auto w-full max-w-[900px] px-3 pb-10 pt-3 sm:px-5 lg:px-8">
        <header className="mb-5 flex items-center justify-between rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex items-center gap-3">
            <Link href="/user/blogs/new" aria-label="Back to create post" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Writing</p><h1 className="text-xl font-black text-slate-900">Drafts</h1></div>
          </div>
          <Link href="/user/blogs/new" className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700"><Plus className="h-4 w-4" />New post</Link>
        </header>

        {loading ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading drafts...</div>
        ) : drafts.length ? (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <article key={draft.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Draft</p><h2 className="mt-1 text-base font-black text-slate-900">{draft.title || 'Untitled draft'}</h2><p className="mt-1 line-clamp-2 text-sm text-slate-600">{draft.excerpt || 'No excerpt yet.'}</p></div>
                  <FilePenLine className="h-5 w-5 shrink-0 text-amber-500" />
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />Updated {draft.updated_at ? new Date(draft.updated_at).toLocaleDateString() : 'recently'}</div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm"><FilePenLine className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-3 text-base font-bold text-slate-800">No drafts yet</h2><p className="mt-1 text-sm text-slate-500">Save a blog post as a draft and it will appear here.</p><Link href="/user/blogs/new" className="mt-4 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">Create a draft</Link></div>
        )}
      </div>
    </main>
  )
}