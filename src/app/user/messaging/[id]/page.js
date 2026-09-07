'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send, UserRound } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'

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

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const otherUserId = params?.id
  const [currentUser, setCurrentUser] = useState(null)
  const [otherUser, setOtherUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!otherUserId) return
    let active = true

    const loadConversation = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/messages/${otherUserId}`, { credentials: 'same-origin' })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load conversation.')
        if (!active) return
        setCurrentUser(result.current_user)
        setOtherUser(result.other_user)
        setMessages(result.messages || [])
      } catch (loadError) {
        if (active) setError(loadError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadConversation()
    return () => { active = false }
  }, [otherUserId])

  const sendMessage = async (event) => {
    event.preventDefault()
    const trimmedBody = body.trim()
    if (!trimmedBody || !otherUserId) return

    setSending(true)
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ recipientId: otherUserId, body: trimmedBody }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.')
      setMessages((previous) => [...previous, { ...result.message, sender_user: currentUser, recipient_user: otherUser }])
      setBody('')
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#eef4f5] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[900px] flex-col px-3 pb-4 pt-3 sm:px-5 sm:pb-6 lg:px-8">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/user/messaging') }} aria-label="Back to messages" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {otherUser && (
            <Link href={`/user/profile/${otherUser.id}`} className="flex min-w-0 items-center gap-3">
              <ProfileAvatar user={otherUser} size="h-10 w-10" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Conversation</p>
                <h1 className="truncate text-base font-black text-slate-950">{otherUser.full_name || 'Community member'}</h1>
              </div>
            </Link>
          )}
        </header>

        {loading ? (
          <div className="flex-1 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading conversation...</div>
        ) : error ? (
          <div className="flex-1 bg-white p-8 text-center text-sm text-red-700 shadow-sm">{error}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-white shadow-sm">
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {messages.length ? messages.map((message) => {
                const isOwnMessage = message.sender_id === currentUser?.id
                const sender = isOwnMessage ? currentUser : otherUser
                return (
                  <div key={message.id} className={`flex items-end gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    {!isOwnMessage && <Link href={`/user/profile/${otherUser.id}`} aria-label={`Open ${sender?.full_name || 'user'} profile`}><ProfileAvatar user={sender} size="h-8 w-8" /></Link>}
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-5 ${isOwnMessage ? 'bg-[#147d75] text-white' : 'bg-slate-100 text-slate-800'}`}>
                      <p>{message.body}</p>
                      <time className={`mt-1 block text-[10px] ${isOwnMessage ? 'text-white/70' : 'text-slate-400'}`}>{message.created_at ? new Date(message.created_at).toLocaleString() : 'Recently'}</time>
                    </div>
                    {isOwnMessage && <ProfileAvatar user={currentUser} size="h-8 w-8" />}
                  </div>
                )
              }) : <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-3 sm:p-4">
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." rows={2} className="min-w-0 flex-1 resize-none border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#147d75]" />
              <button type="submit" disabled={sending || !body.trim()} className="inline-flex items-center gap-2 self-end bg-[#147d75] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending' : 'Send'}</button>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}
