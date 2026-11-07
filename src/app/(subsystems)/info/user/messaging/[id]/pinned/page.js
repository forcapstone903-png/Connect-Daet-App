'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Image as ImageIcon, Pin, Play, Video } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const messageKind = (message) => {
  if (!message) return 'unavailable'
  if (message.media_type === 'video') return 'video'
  if (message.media_url) return 'image'
  return 'text'
}

const messagePreview = (message) => {
  if (!message) return 'This message is no longer available'
  if (message.body) return message.body
  if (message.message_type === 'gif') return 'GIF'
  if (message.message_type === 'sticker') return 'Sticker'
  if (message.media_type === 'video') return 'Video'
  if (message.media_url) return 'Image'
  return 'Message'
}

export default function PinnedMessagesPage() {
  const params = useParams()
  const router = useRouter()
  const otherUserId = params?.id
  const [items, setItems] = useState([])
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPinned = async () => {
    if (!otherUserId) return
    try {
      const response = await fetch(`/api/messages/${encodeURIComponent(otherUserId)}/pinned`, { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load pinned messages.')
      setCurrentUserId(result.current_user_id || '')
      setItems(result.pinned_messages || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load pinned messages.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPinned()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [otherUserId])

  useEffect(() => {
    if (!otherUserId || !supabase?.channel) return undefined
    const channel = supabase
      .channel(`pinned-messages-${otherUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => {
        void loadPinned()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [otherUserId])

  const openPinnedMessage = (item) => {
    if (item.unavailable || !item.message?.id) return
    router.push(`/user/messaging/${encodeURIComponent(otherUserId)}#message-${encodeURIComponent(item.message.id)}`)
  }

  return (
    <main className="min-h-screen bg-[#f4f8f6] text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-2xl bg-white shadow-sm sm:my-4 sm:min-h-[calc(100vh-2rem)] sm:rounded-2xl sm:border sm:border-slate-200">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:rounded-t-2xl">
          <button type="button" onClick={() => router.replace(`/user/messaging/${encodeURIComponent(otherUserId)}`)} aria-label="Back to conversation" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-slate-950">Pinned Messages</h1>
            <p className="text-xs font-medium text-slate-500">Shared in this conversation</p>
          </div>
          <Pin className="h-5 w-5 text-[#147d75]" />
        </header>

        {loading ? <p className="p-6 text-sm text-slate-500">Loading pinned messages...</p> : error ? <div className="p-6"><p className="text-sm font-semibold text-red-600">{error}</p><button type="button" onClick={() => { setLoading(true); setError(''); void loadPinned() }} className="mt-3 rounded-full bg-[#147d75] px-4 py-2 text-sm font-bold text-white">Try again</button></div> : items.length === 0 ? <div className="p-10 text-center"><Pin className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-600">No pinned messages yet.</p></div> : (
          <div className="space-y-3 p-3 sm:p-4">
            {items.map((item) => {
              const kind = messageKind(item.message)
              const unavailable = item.unavailable || kind === 'unavailable'
              return (
                <button key={item.message_id} type="button" disabled={unavailable} onClick={() => openPinnedMessage(item)} className={`block w-full rounded-2xl border p-4 text-left transition ${unavailable ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-65' : 'border-slate-200 bg-white shadow-sm hover:border-[#147d75]/40 hover:bg-[#f8fcfa] hover:shadow-md'}`}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 aspect-square items-center justify-center overflow-hidden rounded-full bg-[#147d75]/10 text-sm font-black text-[#147d75]">
                      {item.sender?.profile_image_url ? <img src={item.sender.profile_image_url} alt="" className="h-full w-full object-cover" /> : (item.sender?.full_name || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-extrabold text-slate-900">{item.sender?.full_name || 'Community member'}</p><p className="shrink-0 text-right text-[11px] font-medium leading-4 text-slate-400">{item.pinned_at ? new Date(item.pinned_at).toLocaleString() : 'Pinned'}</p></div>
                      {unavailable ? <p className="mt-2 text-sm italic text-slate-500">This message is no longer available</p> : kind === 'text' ? <p className="mt-2 line-clamp-3 text-sm text-slate-700">{messagePreview(item.message)}</p> : <div className="relative mt-2 w-fit max-w-full overflow-hidden rounded-xl bg-slate-100">{kind === 'video' ? <><video src={item.message.media_url} className="max-h-56 max-w-full" preload="metadata" /><span className="absolute inset-0 flex items-center justify-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span></> : <img src={item.message.media_url} alt={messagePreview(item)} className="max-h-56 max-w-full object-contain" />}</div>}
                      <p className="mt-3 text-xs font-semibold text-slate-500">Pinned by <span className="text-slate-700">{item.actor?.id === currentUserId ? 'You' : item.actor?.full_name || 'Community member'}</span></p>
                      <p className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#147d75]">{kind === 'text' ? <Pin className="h-3 w-3" /> : kind === 'video' ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}{kind === 'text' ? 'Text message' : kind === 'video' ? 'Video' : 'Image'}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
