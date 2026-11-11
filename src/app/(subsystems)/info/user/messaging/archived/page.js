'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ChevronLeft, RotateCcw } from 'lucide-react'
import UserSectionHeader from '@/app/(subsystems)/info/components/user/UserSectionHeader'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import UserProfileLink from '@/app/(subsystems)/info/components/user/UserProfileLink'

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
    fetch('/info/api/messages?archived=true', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((result) => { if (result.success) setConversations(result.conversations || []) })
      .finally(() => setLoading(false))
  }, [])

  const unarchive = async (conversationId) => {
    const response = await fetch(`/info/api/messages/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ isArchived: false }) })
    const result = await response.json()
    if (response.ok && result.success) setConversations((previous) => previous.filter((conversation) => conversation.other_user?.id !== conversationId))
  }

  return (
    <main className="usr-section-page usr-inbox min-h-screen text-slate-900">
      <UserTopHeader spacer={false} homeHref="/info/user/messaging" />
      <div className="usr-section-container mx-auto w-full max-w-[900px] px-3 pb-28 pt-3 sm:px-5 sm:pb-10 lg:px-8">
        <UserSectionHeader eyebrow="A quieter inbox" title="Archived messages" description="Conversations you have put away. Restore one whenever you are ready to reconnect." emoji="📬" hideMobileTitle>
          <Link href="/info/user/messaging" className="usr-section-secondary hidden lg:inline-flex"><ChevronLeft className="h-4 w-4" />Back to messages</Link>
        </UserSectionHeader>
        <section className="usr-card overflow-hidden">
          {loading ? <div className="p-6 text-sm text-slate-500">Loading archived conversations...</div> : conversations.length ? conversations.map((conversation) => {
            const userId = conversation.other_user?.id || conversation.id
            return <div key={userId} className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 sm:px-5"><UserProfileLink user={conversation.other_user} href={`/info/user/messaging/${userId}`} className="flex min-w-0 flex-1 items-center gap-3"><ProfileAvatar user={conversation.other_user} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{conversation.other_user?.full_name || 'Community member'}</p><p className="truncate text-sm text-slate-600">{conversation.body}</p></div></UserProfileLink><button type="button" onClick={() => unarchive(userId)} aria-label="Unarchive conversation" title="Unarchive" className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><RotateCcw className="h-4 w-4" /></button></div>
          }) : <div className="usr-inbox-empty p-8 text-center sm:p-10"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Archive className="h-6 w-6" aria-hidden="true" /></span><p className="mt-3 text-sm font-bold text-slate-800">No archived conversations</p><p className="mt-1 text-xs text-slate-500">Conversations you archive will appear here.</p></div>}
        </section>
      </div>
    </main>
  )
}
