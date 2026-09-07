'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Paperclip, Send, X } from 'lucide-react'
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
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [mediaType, setMediaType] = useState(null)
  const [videoTooLarge, setVideoTooLarge] = useState(null)
  const mediaInputRef = useRef(null)

  useEffect(() => () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
  }, [mediaPreview])

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
    if ((!trimmedBody && !mediaFile) || videoTooLarge || !otherUserId) return

    setSending(true)
    try {
      let uploadedMediaUrl = null
      let uploadedMediaType = null
      if (mediaFile) {
        const uploadData = new FormData()
        uploadData.append('file', mediaFile)
        uploadData.append('bucket', 'profile-media')
        uploadData.append('folder', `messages/${currentUser.id}`)
        const uploadResponse = await fetch('/api/upload', { method: 'POST', credentials: 'same-origin', body: uploadData })
        const uploadResult = await uploadResponse.json()
        if (!uploadResponse.ok || !uploadResult.success) throw new Error(uploadResult.error || 'Unable to upload attachment.')
        uploadedMediaUrl = uploadResult.url
        uploadedMediaType = mediaType
      }

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ recipientId: otherUserId, body: trimmedBody, mediaUrl: uploadedMediaUrl, mediaType: uploadedMediaType }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.')
      setMessages((previous) => [...previous, { ...result.message, sender_user: currentUser, recipient_user: otherUser }])
      setBody('')
      setMediaFile(null)
      setMediaPreview('')
      setMediaType(null)
      if (mediaInputRef.current) mediaInputRef.current.value = ''
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setSending(false)
    }
  }

  const handleMediaChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const nextMediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null
    if (!nextMediaType || (nextMediaType === 'image' && file.size > 20 * 1024 * 1024)) {
      setError('Choose a JPG, PNG, WEBP, MP4, or MOV file up to 20MB.')
      event.target.value = ''
      return
    }
    setError('')
    setMediaFile(file)
    setMediaType(nextMediaType)
    setMediaPreview(URL.createObjectURL(file))
    setVideoTooLarge(nextMediaType === 'video' && file.size > 20 * 1024 * 1024 ? {
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1),
    } : null)
  }

  const clearMedia = () => {
    setMediaFile(null)
    setMediaPreview('')
    setMediaType(null)
    setVideoTooLarge(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }

  return (
    <main className="conversation-page flex h-[100dvh] w-full flex-col overflow-hidden bg-[#eef4f5] text-slate-900">
      <div className="conversation-shell flex h-full min-h-0 w-full flex-col overflow-hidden">
        <header className="conversation-header flex flex-[0_0_auto] items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
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

        {videoTooLarge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="video-size-warning" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
              <h2 id="video-size-warning" className="text-base font-black text-slate-950">Video is too large</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">The selected video is {videoTooLarge.size} MB. The maximum allowed size is 20 MB.</p>
              <p className="mt-2 truncate text-xs font-semibold text-slate-500" title={videoTooLarge.name}>{videoTooLarge.name}</p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={clearMedia} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Remove</button>
                <button type="button" onClick={() => { setVideoTooLarge(null); mediaInputRef.current?.click() }} className="rounded-full bg-[#147d75] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f685f]">Choose another video</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="messages-container min-h-0 flex-1 overflow-hidden bg-white text-sm text-slate-500"><div className="p-6">Loading conversation...</div></div>
        ) : error ? (
          <div className="messages-container min-h-0 flex-1 overflow-hidden bg-white text-center text-sm text-red-700"><div className="p-8">{error}</div></div>
        ) : (
          <>
            <div className="messages-container min-h-0 flex-1 w-full overflow-hidden bg-white">
              <div className="messages-scroll h-full min-h-0 w-full space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain">
              {messages.length ? messages.map((message) => {
                const isOwnMessage = message.sender_id === currentUser?.id
                const sender = isOwnMessage ? currentUser : otherUser
                return (
                  <div key={message.id} className={`flex items-end gap-2 px-4 sm:px-6 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    {!isOwnMessage && <Link href={`/user/profile/${otherUser.id}`} aria-label={`Open ${sender?.full_name || 'user'} profile`}><ProfileAvatar user={sender} size="h-8 w-8" /></Link>}
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-5 ${isOwnMessage ? 'bg-[#147d75] text-white' : 'bg-slate-100 text-slate-800'}`}>
                      {message.media_url && (message.media_type === 'video' ? <video src={message.media_url} controls className="mb-2 max-h-72 max-w-full rounded-lg" /> : <img src={message.media_url} alt="Shared attachment" className="mb-2 max-h-72 max-w-full rounded-lg object-contain" />)}
                      {message.body && <p>{message.body}</p>}
                      <time className={`mt-1 block text-[10px] ${isOwnMessage ? 'text-white/70' : 'text-slate-400'}`}>{message.created_at ? new Date(message.created_at).toLocaleString() : 'Recently'}</time>
                    </div>
                    {isOwnMessage && <ProfileAvatar user={currentUser} size="h-8 w-8" />}
                  </div>
                )
              }) : <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>}
              </div>
            </div>
            <div className="message-composer flex flex-[0_0_auto] w-full flex-col bg-white">
              {mediaPreview && <div className="shrink-0 border-t border-slate-200 px-3 pt-3 sm:px-4"><div className="relative w-fit max-w-full rounded-lg bg-slate-100 p-2">{mediaType === 'video' ? <video src={mediaPreview} controls className="max-h-32 max-w-full rounded" /> : <img src={mediaPreview} alt="Attachment preview" className="max-h-32 max-w-full rounded object-contain" />}<button type="button" onClick={clearMedia} aria-label="Remove attachment" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white"><X className="h-3.5 w-3.5" /></button></div></div>}
              <form onSubmit={sendMessage} className="message-composer-row relative flex shrink-0 items-center gap-2 border-t border-slate-200 p-3 sm:p-4">
                <input ref={mediaInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={handleMediaChange} className="hidden" />
                <button type="button" onClick={() => mediaInputRef.current?.click()} aria-label="Add photo or video" title="Add photo or video" className="attach-button flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><Paperclip className="h-5 w-5" /></button>
                <div className="message-input-wrapper relative min-w-0 flex-1">
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a message..." rows={1} className="message-input h-12 w-full resize-none border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#147d75]" />
                </div>
                <button type="submit" disabled={sending || videoTooLarge || (!body.trim() && !mediaFile)} className="send-button inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[#147d75] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending' : 'Send'}</button>
              </form>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
