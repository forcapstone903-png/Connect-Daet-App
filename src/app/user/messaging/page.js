'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Archive, Mail, Plus, Search, Send, UserRound, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [recipientQuery, setRecipientQuery] = useState('')
  const [recipientResults, setRecipientResults] = useState([])
  const [retryKey, setRetryKey] = useState(0)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeQuery, setComposeQuery] = useState('')
  const [composeResults, setComposeResults] = useState([])
  const [composeRecipient, setComposeRecipient] = useState(null)
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [composeError, setComposeError] = useState('')
  const [revealedConversation, setRevealedConversation] = useState(null)
  const gestureRef = useRef({ id: null, startX: 0, startY: 0, timer: null })

  const clearGesture = () => {
    if (gestureRef.current.timer) window.clearTimeout(gestureRef.current.timer)
    gestureRef.current.timer = null
  }

  const handleTouchStart = (event, conversationId) => {
    clearGesture()
    const touch = event.touches[0]
    gestureRef.current = { id: conversationId, startX: touch.clientX, startY: touch.clientY, timer: window.setTimeout(() => setRevealedConversation(conversationId), 650) }
  }

  const handleTouchMove = (event) => {
    const touch = event.touches[0]
    if (Math.abs(touch.clientX - gestureRef.current.startX) > 10 || Math.abs(touch.clientY - gestureRef.current.startY) > 10) clearGesture()
  }

  const handleTouchEnd = (event, conversationId) => {
    clearGesture()
    const touch = event.changedTouches[0]
    if (gestureRef.current.id === conversationId && Math.abs(touch.clientX - gestureRef.current.startX) > 60) setRevealedConversation(conversationId)
  }

  const updateArchive = async (conversationId, isArchived) => {
    const response = await fetch(`/api/messages/${conversationId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ isArchived }) })
    const result = await response.json()
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update conversation.')
    setConversations((previous) => previous.filter((conversation) => conversation.other_user?.id !== conversationId))
    setRevealedConversation(null)
  }

  useEffect(() => {
    let active = true

    const loadMessages = async () => {
      try {
        setLoadError('')
        const response = await fetch('/api/messages', { credentials: 'same-origin' })
        const result = await response.json()
        if (active && response.ok && result.success) {
          setConversations(result.conversations || [])
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

  useEffect(() => {
    const query = composeQuery.trim()
    if (query.length < 2 || composeRecipient) {
      queueMicrotask(() => setComposeResults([]))
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}&limit=5`, { credentials: 'same-origin', signal: controller.signal })
        const result = await response.json()
        if (!controller.signal.aborted) setComposeResults(result.success ? result.users || [] : [])
      } catch (error) {
        if (error.name !== 'AbortError') setComposeResults([])
      }
    }, 300)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [composeQuery, composeRecipient])

  const openCompose = () => {
    setComposeOpen(true)
    setComposeQuery('')
    setComposeResults([])
    setComposeRecipient(null)
    setComposeBody('')
    setComposeError('')
  }

  const sendComposeMessage = async (event) => {
    event.preventDefault()
    if (!composeRecipient || !composeBody.trim()) return

    setComposeSending(true)
    setComposeError('')
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ recipientId: composeRecipient.id, body: composeBody.trim() }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.')
      setComposeOpen(false)
      router.push(`/user/messaging/${encodeURIComponent(composeRecipient.id)}`)
    } catch (error) {
      setComposeError(error.message || 'Unable to send message.')
    } finally {
      setComposeSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#eef4f5] text-slate-900">
      <div className="mx-auto w-full max-w-225 px-3 pb-28 pt-3 sm:px-5 sm:pb-10 lg:px-8">
        <header className="mb-4 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Inbox</p>
              <h1 className="text-xl font-black text-slate-950">Messages</h1>
            </div>
          </div>
          <Link href="/user/messaging/archived" className="mr-2 text-xs font-bold text-[#147d75] hover:underline">Archived</Link>
        </header>

        {composeOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-0 sm:items-center sm:p-4">
            <form onSubmit={sendComposeMessage} className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
                <h2 className="text-base font-black text-slate-950">New Message</h2>
                <button type="button" onClick={() => setComposeOpen(false)} aria-label="Close new message" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="relative">
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">To:</label>
                  {composeRecipient ? (
                    <button type="button" onClick={() => { setComposeRecipient(null); setComposeQuery('') }} className="flex w-full items-center gap-2 border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50">
                      <ProfileAvatar user={composeRecipient} size="h-8 w-8" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{composeRecipient.full_name || 'Community member'}</span>
                      <X className="h-4 w-4 text-slate-400" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 border border-slate-200 px-3 py-2.5">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input autoFocus value={composeQuery} onChange={(event) => setComposeQuery(event.target.value)} placeholder="Search a community member" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
                    </div>
                  )}
                  {composeResults.length > 0 && <div className="absolute left-0 right-0 top-full z-10 border border-slate-200 bg-white shadow-lg">{composeResults.map((person) => <button key={person.id} type="button" onClick={() => { setComposeRecipient(person); setComposeQuery(person.full_name || ''); setComposeResults([]) }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><ProfileAvatar user={person} size="h-8 w-8" /><span className="text-sm font-semibold text-slate-800">{person.full_name || 'Community member'}</span></button>)}</div>}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-600">Message</label>
                  <textarea value={composeBody} onChange={(event) => setComposeBody(event.target.value)} placeholder="Write a message..." rows={4} className="w-full resize-none border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#147d75]" />
                </div>
                {composeError && <p className="text-xs font-semibold text-red-600">{composeError}</p>}
                <div className="flex justify-end"><button type="submit" disabled={composeSending || !composeRecipient || !composeBody.trim()} className="inline-flex items-center gap-2 bg-[#147d75] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{composeSending ? 'Sending' : 'Send'}</button></div>
              </div>
            </form>
          </div>
        )}

        <div className="relative mb-4 flex items-center gap-2 border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={recipientQuery} onChange={(event) => setRecipientQuery(event.target.value)} placeholder="Search a community member" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
          {recipientResults.length > 0 && <div className="absolute left-3 right-3 top-18 z-10 border border-slate-200 bg-white shadow-lg sm:left-auto sm:right-auto sm:w-[calc(100%-2rem)]">{recipientResults.map((person) => <Link key={person.id} href={`/user/messaging/${encodeURIComponent(person.id)}`} onClick={() => setRecipientResults([])} className="flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"><span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-sky-700">{person.profile_image_url ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-3.5 w-3.5" />}</span><span className="text-xs font-semibold">{person.full_name || 'Community member'}</span></Link>)}</div>}
        </div>

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
              ) : conversations.length ? (
            <div className="divide-y divide-slate-100">
                {conversations.map((conversation) => {
                  const conversationId = conversation.other_user?.id || conversation.id
                  const revealed = revealedConversation === conversationId
                  return (
                    <div key={conversationId} className="relative overflow-hidden" onTouchStart={(event) => handleTouchStart(event, conversationId)} onTouchMove={handleTouchMove} onTouchEnd={(event) => handleTouchEnd(event, conversationId)}>
                      <div className="absolute inset-y-0 right-0 flex items-center gap-1 bg-slate-100 px-2">
                        <button type="button" onClick={() => updateArchive(conversationId, true)} aria-label="Archive conversation" title="Archive" className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Archive className="h-4 w-4" /></button>
                      </div>
                      <Link key={conversationId} href={`/user/messaging/${encodeURIComponent(conversationId)}`} onClick={(event) => { if (revealed) { event.preventDefault(); setRevealedConversation(null) } }} className={`relative flex gap-3 bg-white px-4 py-4 transition-transform duration-200 hover:bg-[#f5fbfa] sm:px-5 ${revealed ? '-translate-x-24' : 'translate-x-0'}`}>
                        <ProfileAvatar user={conversation.other_user} />
                        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="truncate text-sm font-bold text-slate-900">{conversation.other_user?.full_name || 'Community member'}</h3><time className="text-[11px] text-slate-400">{conversation.created_at ? new Date(conversation.created_at).toLocaleDateString() : 'Recently'}</time></div><p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{conversation.body}</p></div>
                      </Link>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="p-10 text-center"><Mail className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No messages yet</p><p className="mt-1 text-xs text-slate-400">Your community updates will appear here.</p></div>
          )}
        </section>
      </div>
      <button
        type="button"
        onClick={openCompose}
        aria-label="Start a new conversation"
        title="Start a new conversation"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#147d75] text-white shadow-[0_8px_24px_rgba(20,125,117,0.3)] transition hover:bg-[#0f685f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147d75] lg:bottom-8 lg:right-8"
      >
        <Plus className="h-6 w-6" />
      </button>
    </main>
  )
}
