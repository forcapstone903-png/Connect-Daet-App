'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ArrowLeft, RotateCcw } from 'lucide-react'

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function ProfileAvatar({ user }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700">{user?.profile_image_url ? <img src={user.profile_image_url} alt={user.full_name || 'Profile'} className="h-full w-full object-cover" /> : getInitials(user?.full_name)}</span>
}

export default function ArchivedMessagesPage() {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/messages?archived=true', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((result) => { if (result.success) setConversations(result.conversations || []) })
      .finally(() => setLoading(false))
  }, [])

  const unarchive = async (conversationId) => {
    const response = await fetch(`/api/messages/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ isArchived: false }) })
    const result = await response.json()
    if (response.ok && result.success) setConversations((previous) => previous.filter((conversation) => conversation.other_user?.id !== conversationId))
  }

  return (
    <main className="min-h-screen bg-[#eef4f5] text-slate-900">
      <div className="mx-auto w-full max-w-[900px] px-3 pb-28 pt-3 sm:px-5 sm:pb-10 lg:px-8">
        <header className="mb-4 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <Link href="/user/messaging" aria-label="Back to messages" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Inbox</p><h1 className="text-xl font-black text-slate-950">Archived</h1></div>
        </header>
        <section className="border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="p-6 text-sm text-slate-500">Loading archived conversations...</div> : conversations.length ? conversations.map((conversation) => {
            const userId = conversation.other_user?.id || conversation.id
            return <div key={userId} className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 sm:px-5"><ProfileAvatar user={conversation.other_user} /><Link href={`/user/messaging/${userId}`} className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{conversation.other_user?.full_name || 'Community member'}</p><p className="truncate text-sm text-slate-600">{conversation.body}</p></Link><button type="button" onClick={() => unarchive(userId)} aria-label="Unarchive conversation" title="Unarchive" className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><RotateCcw className="h-4 w-4" /></button></div>
          }) : <div className="p-10 text-center"><Archive className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No archived conversations</p></div>}
        </section>
      </div>
    </main>
  )
}
