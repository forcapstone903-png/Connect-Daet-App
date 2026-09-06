'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bell, Mail, Search } from 'lucide-react'
import { getStoredSession } from '@/lib/authCookies'

export default function UserMessagingPage() {
  const [messages, setMessages] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadMessages = async () => {
      try {
        const response = await fetch('/api/notifications', { credentials: 'same-origin' })
        const result = await response.json()
        if (active && response.ok && result.success) setMessages(result.notifications || [])
      } catch (error) {
        console.error('Messages fetch failed:', error)
      } finally {
        if (active) setLoading(false)
      }
    }

    if (getStoredSession()) loadMessages()
    else setLoading(false)

    return () => { active = false }
  }, [])

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return messages
    return messages.filter((message) => `${message.title} ${message.message}`.toLowerCase().includes(query))
  }, [messages, search])

  return (
    <main className="min-h-screen bg-[#eef4f5] text-slate-900">
      <div className="mx-auto w-full max-w-[900px] px-3 pb-20 pt-3 sm:px-5 lg:px-8">
        <header className="mb-4 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <Link href="/user/dashboard" aria-label="Back to dashboard" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Inbox</p>
              <h1 className="text-xl font-black text-slate-950">Messages</h1>
            </div>
          </div>
          <Link href="/user/notifications" aria-label="Notifications" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Bell className="h-4 w-4" />
          </Link>
        </header>

        <div className="mb-4 flex items-center gap-2 border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>

        <section className="border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
            <div><h2 className="font-extrabold text-slate-950">Your conversations</h2><p className="mt-1 text-xs text-slate-500">Updates and messages from the Daet community</p></div>
            <Mail className="h-5 w-5 text-[#147d75]" />
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading messages...</div>
          ) : filteredMessages.length ? (
            <div className="divide-y divide-slate-100">
              {filteredMessages.map((message) => (
                <Link key={message.id} href={message.action_url || '/user/notifications'} className="flex gap-3 px-4 py-4 transition hover:bg-[#f5fbfa] sm:px-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e7f6f3] text-[#147d75]"><Mail className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="truncate text-sm font-bold text-slate-900">{message.title}</h3><time className="text-[11px] text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleDateString() : 'Recently'}</time></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{message.message}</p></div>
                  {!message.is_read && <span className="mt-1 h-2.5 w-2.5 shrink-0 bg-[#147d75]" aria-label="Unread" />}
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center"><Mail className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No messages yet</p><p className="mt-1 text-xs text-slate-400">Your community updates will appear here.</p></div>
          )}
        </section>
      </div>
    </main>
  )
}
