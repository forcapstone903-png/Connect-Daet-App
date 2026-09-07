'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Mail, Search, Send, UserRound } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { getStoredSession } from '@/lib/authCookies'

function getInitials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function ProfileAvatar({ user, size = 'h-10 w-10' }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700`}>
      {user?.profile_image_url ? <img src={user.profile_image_url} alt={user.full_name || 'Profile'} className="h-full w-full object-cover" /> : getInitials(user?.full_name)}
    </span>
  )
}

export default function UserMessagingPage() {
  const searchParams = useSearchParams()
  const recipientId = searchParams.get('recipientId')
  const [messages, setMessages] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipient, setRecipient] = useState(null)
  const [recipientResults, setRecipientResults] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!recipientId) return

    let active = true
    const loadRecipient = async () => {
      try {
        const response = await fetch(`/api/users/${recipientId}`, { credentials: 'same-origin' })
        const result = await response.json()
        if (!active || !response.ok || !result.success || !result.profile) return
        setRecipient({
          id: result.profile.id,
          full_name: result.profile.full_name,
          profile_image_url: result.profile.profile_image_url,
        })
        setRecipientQuery(result.profile.full_name || '')
      } catch (error) {
        if (active) console.error('Message recipient fetch failed:', error)
      }
    }

    void loadRecipient()
    return () => { active = false }
  }, [recipientId])

  useEffect(() => {
    let active = true

    const loadMessages = async () => {
      try {
        setLoadError('')
        const response = await fetch('/api/messages', { credentials: 'same-origin' })
        const result = await response.json()
        if (active && response.ok && result.success) {
          setMessages(result.messages || [])
          setCurrentUser(result.current_user || null)
        }
        else if (active) throw new Error(result.message || 'Unable to load messages')
      } catch (error) {
        console.error('Messages fetch failed:', error)
        if (active) setLoadError('We could not load your messages right now. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }

    if (getStoredSession()) loadMessages()
    else queueMicrotask(() => setLoading(false))

    return () => { active = false }
  }, [retryKey])

  useEffect(() => {
    const query = recipientQuery.trim()
    if (query.length < 2) {
      queueMicrotask(() => setRecipientResults([]))
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}&limit=5`, { credentials: 'same-origin', signal: controller.signal })
        const result = await response.json()
        if (!controller.signal.aborted) setRecipientResults(result.success ? result.users || [] : [])
      } catch (error) {
        if (error.name !== 'AbortError') setRecipientResults([])
      }
    }, 300)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [recipientQuery])

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!recipient || !body.trim()) return
    setSending(true)
    setNotice('')
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ recipientId: recipient.id, body: body.trim() }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.')
      setMessages((previous) => [{ ...result.message, other_user: recipient }, ...previous])
      setBody('')
      setRecipient(null)
      setRecipientQuery('')
      setNotice('Message sent.')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setSending(false)
    }
  }

  const filteredMessages = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return messages
    return messages.filter((message) => `${message.title || ''} ${message.body || ''}`.toLowerCase().includes(query))
  }, [messages, search])

  const conversationMessages = useMemo(() => {
    if (!recipientId || !currentUser) return []
    return messages
      .filter((message) => (
        (message.sender_id === currentUser.id && message.recipient_id === recipientId)
        || (message.sender_id === recipientId && message.recipient_id === currentUser.id)
      ))
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  }, [currentUser, messages, recipientId])

  return (
    <main className="min-h-screen bg-[#eef4f5] text-slate-900">
      <div className="mx-auto w-full max-w-[900px] px-3 pb-28 pt-3 sm:px-5 sm:pb-10 lg:px-8">
        <header className="mb-4 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Inbox</p>
              <h1 className="text-xl font-black text-slate-950">Messages</h1>
            </div>
          </div>
        </header>

        <div className="mb-4 flex items-center gap-2 border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>

        {recipient && (
          <section className="mb-4 border border-slate-200 bg-white shadow-sm">
            <Link href={`/user/profile/${recipient.id}`} className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 transition hover:bg-slate-50 sm:px-5">
              <ProfileAvatar user={recipient} size="h-11 w-11" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#147d75]">Conversation</p>
                <h2 className="truncate text-base font-black text-slate-950">{recipient.full_name || 'Community member'}</h2>
              </div>
            </Link>
            <div className="max-h-[420px] space-y-3 overflow-y-auto p-4 sm:p-5">
              {conversationMessages.length ? conversationMessages.map((message) => {
                const isOwnMessage = message.sender_id === currentUser?.id
                const sender = isOwnMessage ? currentUser : message.sender_user || recipient
                return (
                  <div key={message.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    {!isOwnMessage && <Link href={`/user/profile/${sender?.id || recipient.id}`} aria-label={`Open ${sender?.full_name || 'user'} profile`}><ProfileAvatar user={sender} size="h-8 w-8" /></Link>}
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-5 ${isOwnMessage ? 'bg-[#147d75] text-white' : 'bg-slate-100 text-slate-800'}`}>
                      <p>{message.body}</p>
                      <time className={`mt-1 block text-[10px] ${isOwnMessage ? 'text-white/70' : 'text-slate-400'}`}>{message.created_at ? new Date(message.created_at).toLocaleString() : 'Recently'}</time>
                    </div>
                    {isOwnMessage && <ProfileAvatar user={currentUser} size="h-8 w-8" />}
                  </div>
                )
              }) : <p className="py-6 text-center text-sm text-slate-500">No messages in this conversation yet.</p>}
            </div>
          </section>
        )}

        <form onSubmit={sendMessage} className="mb-4 border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#147d75]">New message</p>
          <div className="relative">
            <input value={recipientQuery} onChange={(event) => { setRecipientQuery(event.target.value); setRecipient(null) }} placeholder="Search a community member" className="w-full border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#147d75]" />
            {recipientResults.length > 0 && !recipient && <div className="absolute left-0 right-0 top-full z-10 border border-slate-200 bg-white shadow-lg">{recipientResults.map((person) => <button key={person.id} type="button" onClick={() => { setRecipient(person); setRecipientQuery(person.full_name || ''); setRecipientResults([]) }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sky-700">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-3.5 w-3.5" />}</span><span className="text-xs font-semibold">{person.full_name || 'Community member'}</span></button>)}</div>}
          </div>
          <div className="mt-2 flex gap-2"><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." rows={2} className="min-w-0 flex-1 resize-none border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#147d75]" /><button type="submit" disabled={sending || !recipient || !body.trim()} className="inline-flex items-center gap-2 self-end bg-[#147d75] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending' : 'Send'}</button></div>
          {notice && <p className="mt-2 text-xs font-semibold text-[#147d75]">{notice}</p>}
        </form>

        <section className="border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-5">
            <div><h2 className="font-extrabold text-slate-950">Your conversations</h2><p className="mt-1 text-xs text-slate-500">Updates and messages from the Daet community</p></div>
            <Mail className="h-5 w-5 text-[#147d75]" />
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading messages...</div>
          ) : loadError ? (
            <div role="alert" className="p-8 text-center">
              <Mail className="mx-auto h-8 w-8 text-red-300" />
              <p className="mt-3 text-sm font-semibold text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={() => setRetryKey((value) => value + 1)}
                className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          ) : filteredMessages.length ? (
            <div className="divide-y divide-slate-100">
              {filteredMessages.map((message) => (
                  <Link key={message.id} href={`/user/messaging?recipientId=${encodeURIComponent(message.other_user?.id || '')}`} className="flex gap-3 px-4 py-4 transition hover:bg-[#f5fbfa] sm:px-5">
                  <ProfileAvatar user={message.other_user} />
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="truncate text-sm font-bold text-slate-900">{message.other_user?.full_name || 'Community member'}</h3><time className="text-[11px] text-slate-400">{message.created_at ? new Date(message.created_at).toLocaleDateString() : 'Recently'}</time></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{message.body}</p></div>
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
