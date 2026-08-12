import React from 'react'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function AdminForumPage() {
  // Fetch forum threads with latest reply count and last activity
  const { data: threads, error } = await supabase
    .from('forum_threads')
    .select('id, title, created_by, created_at, last_activity_at, reply_count')
    .order('last_activity_at', { ascending: false })

  if (error) {
    console.error('Failed to load forum threads', error)
    return (<div className="p-8">Failed to load forum threads</div>)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-2xl font-bold">Admin Forum</h1>

        <div className="space-y-4">
          {threads && threads.length ? (
            threads.map(thread => (
              <div key={thread.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{thread.title}</h2>
                  <div className="text-sm text-gray-500">Replies: {thread.reply_count || 0}</div>
                </div>
                <div className="mt-2 text-sm text-gray-600">Created: {new Date(thread.created_at).toLocaleString()}</div>
                <div className="mt-2 text-sm text-gray-500">Last activity: {thread.last_activity_at ? new Date(thread.last_activity_at).toLocaleString() : '—'}</div>
              </div>
            ))
          ) : (
            <div className="rounded-lg border p-4 text-gray-500">No forum threads yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
