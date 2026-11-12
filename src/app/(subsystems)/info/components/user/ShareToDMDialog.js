'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

export default function ShareToDMDialog({ contentType, contentId, userId, onClose, onShared }) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [recipients, setRecipients] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const searchUsers = async (value) => {
    setQuery(value)
    setError('')
    if (!value.trim()) {
      setUsers([])
      return
    }

    const term = value.trim().replace(/[,%()]/g, ' ')
    try {
      const { data, error: searchError } = await supabase
        .from('info_users')
        .select('id, full_name')
        .ilike('full_name', `%${term}%`)
        .limit(5)
      if (searchError) throw searchError
      setUsers(data || [])
    } catch (searchError) {
      setError('Unable to search for users. Please try again.')
      console.error('Share recipient search failed:', searchError)
    }
  }

  const toggleRecipient = (user) => {
    setRecipients((current) => current.some((recipient) => recipient.id === user.id)
      ? current.filter((recipient) => recipient.id !== user.id)
      : [...current, user])
    setQuery('')
    setUsers([])
  }

  const send = async () => {
    if (!userId) {
      setError('Please log in to share content by direct message.')
      return
    }
    if (!recipients.length) {
      setError('Select at least one recipient.')
      return
    }

    setLoading(true)
    setError('')
    const rows = recipients.map((recipient) => ({
      user_id: userId,
      content_type: contentType,
      content_id: contentId,
      share_type: 'dm',
      caption: message.trim() || null,
      recipient_user_id: recipient.id,
    }))
    try {
      const { error: shareError } = await supabase.from('content_shares').insert(rows)
      if (shareError) throw shareError
      onShared?.()
      onClose()
    } catch (shareError) {
      console.error('Direct message share failed:', shareError)
      setError('Unable to share this content. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-to-dm-title" className="w-full max-w-[420px] rounded-t-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl dark:border-[#252d3a] dark:bg-[#151a24] dark:text-[#f5f7fa] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="share-to-dm-title" className="text-base font-bold">Share to DM</h2>
          <button type="button" onClick={onClose} aria-label="Close share dialog" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-[#a0aabd] dark:hover:bg-[#252d3a]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => void searchUsers(event.target.value)}
          placeholder="Search users to send to..."
          aria-label="Search users"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-[#252d3a] dark:bg-[#101522] dark:text-[#f5f7fa]"
        />
        {users.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-[#252d3a] dark:bg-[#101522]">
            {users.map((user) => (
              <button key={user.id} type="button" onClick={() => toggleRecipient(user)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-[#252d3a]">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-200">{(user.full_name || 'U')[0].toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.full_name || 'Community member'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {recipients.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recipients.map((recipient) => (
              <span key={recipient.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {recipient.full_name || 'Community member'}
                <button type="button" onClick={() => setRecipients((current) => current.filter((user) => user.id !== recipient.id))} aria-label={`Remove ${recipient.full_name || 'recipient'}`} className="flex h-4 w-4 items-center justify-center">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add a message (optional)..." rows={2} className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 dark:border-[#252d3a] dark:bg-[#101522] dark:text-[#f5f7fa]" />
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <button type="button" onClick={() => void send()} disabled={loading || !userId || !recipients.length} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? 'Sending...' : 'Send'}
        </button>
      </section>
    </div>
  )
}
