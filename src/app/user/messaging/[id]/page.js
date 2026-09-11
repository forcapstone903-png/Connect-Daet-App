'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CornerUpLeft, LoaderCircle, Plus, Search, Send, Smile, Trash2, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import UserProfileLink from '@/app/components/user/UserProfileLink'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'

const TYPING_START_DELAY_MS = 180
const TYPING_STOP_DELAY_MS = 1800
const SEEN_UPDATE_DELAY_MS = 250

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

const EMOJI_CATEGORIES = {
  Recent: ['😀', '😂', '😍', '👍', '❤️', '🔥', '👏', '😭'],
  Smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😍', '🥰', '😘', '😎', '🤔', '😭', '😡'],
  People: ['👋', '🙌', '👏', '👍', '👎', '🙏', '💪', '🤝', '👀', '💃', '🕺'],
  Animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸'],
  Food: ['🍎', '🍕', '🍔', '🍟', '🌮', '🍣', '🍩', '🍪', '🍰', '☕', '🍺', '🍓'],
  Activities: ['⚽', '🏀', '🏈', '🎮', '🎵', '🎉', '🎂', '🏆', '🎨', '🎸'],
  Travel: ['🚗', '🚌', '✈️', '🚀', '🏝️', '🏖️', '🌋', '🗺️', '🗽', '🏕️'],
  Objects: ['💡', '📱', '💻', '📷', '🎁', '💌', '🔑', '📚', '💰', '☂️'],
  Symbols: ['✅', '❌', '❗', '❓', '💯', '⭐', '✨', '❤️', '💔', '♻️'],
}

const STICKER_PHRASES = ['Nah, I\'m busy', 'Leave me alone', 'Not today', 'I\'m tired', 'Nope', 'LOL', 'HAHAHA', 'OMG', 'Seriously?', 'Bruh', 'Wait...', 'Good morning', 'Good night', 'Thank you', 'Sorry']

function createStickerUrl(label) {
  const palette = ['#147d75', '#f59e0b', '#ef4444', '#8b5cf6', '#2563eb', '#f43f5e']
  const index = label.length % palette.length
  const accent = palette[index]
  const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.18"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <rect x="18" y="20" width="444" height="240" rx="54" fill="#fff" stroke="${accent}" stroke-width="12"/>
        <path d="M90 70 Q145 30 185 70" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.88"/>
        <circle cx="120" cy="108" r="26" fill="${accent}" opacity="0.12"/>
        <path d="M104 110 Q120 86 136 110" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>
        <path d="M104 118 Q120 134 136 118" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>
        <text x="240" y="158" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="${accent}" letter-spacing="2">${safeLabel}</text>
        <path d="M70 200 C138 180, 176 214, 240 210 C310 206, 340 182, 410 200" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
      </g>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const otherUserId = params?.id
  const [currentUser, setCurrentUser] = useState(null)
  const [otherUser, setOtherUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [otherUserTyping, setOtherUserTyping] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [viewportHeight, setViewportHeight] = useState('100dvh')
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false)
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState('')
  const [mediaType, setMediaType] = useState(null)
  const [videoTooLarge, setVideoTooLarge] = useState(null)
  const [selectedMedia, setSelectedMedia] = useState(null)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerCategory, setPickerCategory] = useState('Smileys')
  const [pickerSearch, setPickerSearch] = useState('')
  const [gifs, setGifs] = useState([])
  const [gifsLoading, setGifsLoading] = useState(false)
  const [gifError, setGifError] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [actionMessageId, setActionMessageId] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [messageToDelete, setMessageToDelete] = useState(null)
  const [swipeState, setSwipeState] = useState({ id: null, offset: 0 })
  const mediaInputRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  const pickerRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const selectedMessageRef = useRef(null)
  const isNearBottomRef = useRef(true)
  const gestureRef = useRef({ id: null, startX: 0, startY: 0, timer: null, direction: null, pointerId: null })
  const realtimeChannelRef = useRef(null)
  const typingStartTimeoutRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const seenTimeoutRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const currentUserRef = useRef(null)
  const otherUserRef = useRef(null)
  const scrollIntentRef = useRef(null)
  const initialMessagesLoadedRef = useRef(false)

  useEffect(() => {
    const syncViewport = () => {
      if (typeof window === 'undefined') return
      const rawHeight = typeof window.visualViewport?.height === 'number'
        ? window.visualViewport.height
        : window.innerHeight
      const nextHeight = `${Math.round(rawHeight)}px`
      setViewportHeight(nextHeight)
    }

    syncViewport()
    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
    }
  }, [])

  const handleMessagesScroll = () => {
    const scroller = messagesScrollRef.current
    if (!scroller) return
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 180
    isNearBottomRef.current = nearBottom
    setIsNearBottom(nearBottom)
    if (nearBottom) setShowNewMessageIndicator(false)
  }

  const clearGesture = () => {
    if (gestureRef.current.timer) window.clearTimeout(gestureRef.current.timer)
    gestureRef.current.timer = null
  }

  const handleMessagePointerDown = (event, messageId) => {
    clearGesture()
    if (!event.target.closest('button, a, video, input, textarea')) event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    gestureRef.current = {
      id: messageId,
      startX: event.clientX,
      startY: event.clientY,
      direction: null,
      pointerId: event.pointerId,
      timer: window.setTimeout(() => setActionMessageId(messageId), 650),
    }
  }

  const handleMessagePointerMove = (event) => {
    if (gestureRef.current.id !== event.currentTarget.dataset.messageId) return
    const deltaX = event.clientX - gestureRef.current.startX
    const deltaY = event.clientY - gestureRef.current.startY
    const horizontalDistance = Math.abs(deltaX)
    const verticalDistance = Math.abs(deltaY)
    if (!gestureRef.current.direction && (horizontalDistance > 10 || verticalDistance > 10)) {
      gestureRef.current.direction = horizontalDistance > verticalDistance ? 'horizontal' : 'vertical'
      clearGesture()
    }
    if (gestureRef.current.direction === 'horizontal') {
      event.preventDefault()
      const offset = Math.max(-110, Math.min(110, deltaX))
      gestureRef.current.offset = offset
      setSwipeState({ id: gestureRef.current.id, offset })
    }
  }

  const handleMessagePointerUp = (event, messageId) => {
    clearGesture()
    const wasHorizontal = gestureRef.current.id === messageId && gestureRef.current.direction === 'horizontal'
    const offset = gestureRef.current.offset || 0
    if (wasHorizontal && Math.abs(offset) >= 60) {
      const message = messages.find((item) => item.id === messageId)
      if (message) selectReply(message)
    }
    setSwipeState({ id: null, offset: 0 })
    gestureRef.current.id = null
    gestureRef.current.offset = 0
  }

  const handleMessagePointerCancel = () => {
    clearGesture()
    setSwipeState({ id: null, offset: 0 })
    gestureRef.current.id = null
    gestureRef.current.offset = 0
  }

  const selectReply = (message) => {
    setReplyTo(message)
    setActionMessageId(null)
  }

  useEffect(() => {
    const handleOutsidePointerDown = (event) => {
      if (selectedMessageRef.current && !selectedMessageRef.current.contains(event.target)) {
        setActionMessageId(null)
      }
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
        setAttachmentMenuOpen(false)
      }
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setPickerOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [])

  const scrollConversationToBottom = (behavior = 'auto') => {
    const messagesScroller = messagesScrollRef.current
    if (!messagesScroller) return
    requestAnimationFrame(() => {
      messagesScroller.scrollTo({ top: messagesScroller.scrollHeight, behavior })
      isNearBottomRef.current = true
      setIsNearBottom(true)
      setShowNewMessageIndicator(false)
    })
  }

  useEffect(() => {
    if (loading || !messages.length) return

    const intent = scrollIntentRef.current
    if (!intent) return
    scrollIntentRef.current = null

    const behavior = intent === 'realtime' ? 'smooth' : 'auto'
    requestAnimationFrame(() => scrollConversationToBottom(behavior))
  }, [messages, loading])

  const retryConversation = () => {
    setError('')
    setLoading(true)
    void loadConversation(false)
  }

  const scrollToMessage = (messageId) => {
    if (!messageId) return
    const target = document.getElementById(`message-${messageId}`)
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(messageId)
    window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 1200)
  }

  const loadConversation = async (silent = false) => {
    if (!otherUserId) return

    try {
      if (!silent) {
        setLoading(true)
      }
      setError('')

      const response = await fetch(`/api/messages/${encodeURIComponent(otherUserId)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 401) {
        router.replace('/login?message=Please%20sign%20in%20again%20to%20view%20messages.')
        return
      }
      if (!response.ok) {
        throw new Error(result?.message || `Unable to load messages (${response.status}).`)
      }

      if (!result?.success) {
        throw new Error(result?.message || 'Unable to load messages.')
      }

      setCurrentUser(result.current_user)
      setOtherUser(result.other_user)
      currentUserRef.current = result.current_user
      otherUserRef.current = result.other_user

      const incomingMessages = Array.isArray(result.messages) ? result.messages : []
      setMessages((previousMessages) => {
        const seen = new Map(previousMessages.map((message) => [message.id, message]))
        for (const incoming of incomingMessages) {
          if (!seen.has(incoming.id)) {
            seen.set(incoming.id, { ...incoming, sender_user: incoming.sender_user || null, recipient_user: incoming.recipient_user || null })
          }
        }
        const merged = [...seen.values()]
        merged.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        return merged
      })

      if (!initialMessagesLoadedRef.current && incomingMessages.length > 0) {
        initialMessagesLoadedRef.current = true
        scrollIntentRef.current = 'initial'
      }
    } catch (loadError) {
      const errorMessage = loadError?.message === 'Failed to fetch'
        ? 'The messaging service could not be reached. Check your connection and try again.'
        : loadError?.message || 'Unable to load messages.'
      setError(errorMessage)
      setLoading(false)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const markConversationRead = async () => {
    if (!otherUserId || document.visibilityState !== 'visible') return

    const response = await fetch(`/api/messages/${encodeURIComponent(otherUserId)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markRead: true }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.success) return

    const seenAt = new Date().toISOString()
    setMessages((previous) => previous.map((message) => (
      message.sender_id === otherUserId && message.recipient_id === currentUserRef.current?.id && !message.read_at
        ? { ...message, read_at: seenAt }
        : message
    )))
    window.dispatchEvent(new Event('daet-messages-updated'))
  }

  const scheduleMarkConversationRead = () => {
    if (seenTimeoutRef.current) window.clearTimeout(seenTimeoutRef.current)
    seenTimeoutRef.current = window.setTimeout(() => {
      void markConversationRead()
    }, SEEN_UPDATE_DELAY_MS)
  }

  const trackTyping = async (typing) => {
    const channel = realtimeChannelRef.current
    if (!channel || !currentUserRef.current?.id) return
    try {
      await channel.track({ user_id: currentUserRef.current.id, typing: Boolean(typing), updated_at: Date.now() })
    } catch {
      // Presence is best-effort and never blocks message sending.
    }
  }

  const handleBodyChange = (event) => {
    const nextBody = event.target.value
    setBody(nextBody)
    if (typingStartTimeoutRef.current) window.clearTimeout(typingStartTimeoutRef.current)
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
    if (nextBody.trim()) {
      typingStartTimeoutRef.current = window.setTimeout(() => {
        void trackTyping(true)
      }, TYPING_START_DELAY_MS)
      typingTimeoutRef.current = window.setTimeout(() => {
        void trackTyping(false)
      }, TYPING_STOP_DELAY_MS)
    } else {
      void trackTyping(false)
    }
  }

  useEffect(() => {
    if (!otherUserId) return undefined

    let active = true
    const storedSession = getStoredSessionObject()
    const currentUserId = storedSession?.user_id || storedSession?.id || ''
    void loadConversation(false).then(() => {
      if (active) scheduleMarkConversationRead()
    })

    let channel = null
    const channelName = `conversation-${[currentUserId, otherUserId].sort().join('-')}`
    const createConversationChannel = () => {
      if (!active || !supabase?.channel) return

      const nextChannel = supabase.channel(channelName)
      channel = nextChannel
      realtimeChannelRef.current = nextChannel
      nextChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
          if (!active) return
          const message = payload?.new || payload?.old
          if (!message || ![message.sender_id, message.recipient_id].includes(otherUserId) || ![message.sender_id, message.recipient_id].includes(currentUserId)) return

          if (payload.eventType === 'INSERT') {
            const shouldFollow = isNearBottomRef.current
            setMessages((previous) => previous.some((item) => item.id === message.id)
              ? previous
              : [...previous, { ...message, sender_user: message.sender_id === currentUserId ? currentUserRef.current : otherUserRef.current, recipient_user: message.recipient_id === currentUserId ? currentUserRef.current : otherUserRef.current }].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)))
            if (shouldFollow) {
              scrollIntentRef.current = 'realtime'
            } else {
              setShowNewMessageIndicator(true)
            }
            if (message.sender_id === otherUserId && document.visibilityState === 'visible') scheduleMarkConversationRead()
            window.dispatchEvent(new Event('daet-messages-updated'))
          } else if (payload.eventType === 'UPDATE') {
            setMessages((previous) => previous.map((item) => item.id === message.id ? { ...item, ...message } : item))
          } else if (payload.eventType === 'DELETE') {
            setMessages((previous) => previous.filter((item) => item.id !== message.id))
          }
        })
        .on('presence', { event: 'sync' }, () => {
          const states = nextChannel.presenceState()
          const otherState = Object.values(states).flat().find((state) => state.user_id === otherUserId)
          setOtherUserTyping(Boolean(otherState?.typing))
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttemptRef.current = 0
            return
          }
          if (!active || !['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) return
          if (channel !== nextChannel) return
          if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current)
          const delay = Math.min(5000, 1000 * (2 ** reconnectAttemptRef.current))
          reconnectAttemptRef.current += 1
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (!active || channel !== nextChannel) return
            supabase.removeChannel(nextChannel)
            createConversationChannel()
          }, delay)
        })
    }
    createConversationChannel()

    return () => {
      active = false
      if (typingStartTimeoutRef.current) window.clearTimeout(typingStartTimeoutRef.current)
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
      if (seenTimeoutRef.current) window.clearTimeout(seenTimeoutRef.current)
      if (reconnectTimeoutRef.current) window.clearTimeout(reconnectTimeoutRef.current)
      void trackTyping(false)
      setOtherUserTyping(false)
      if (channel) supabase.removeChannel(channel)
      realtimeChannelRef.current = null
    }
  }, [otherUserId])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleMarkConversationRead()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [otherUserId, currentUser?.id])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyHeight = document.body.style.height
    const previousRootOverflow = document.documentElement.style.overflow
    const previousRootHeight = document.documentElement.style.height

    document.body.style.overflow = 'hidden'
    document.body.style.height = '100%'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.height = '100%'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.height = previousBodyHeight
      document.documentElement.style.overflow = previousRootOverflow
      document.documentElement.style.height = previousRootHeight
    }
  }, [otherUserId])

  useEffect(() => () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
  }, [mediaPreview])

  const loadGifs = async (query = pickerSearch) => {
    const controller = new AbortController()
    setGifsLoading(true)
    setGifError('')
    try {
      const response = await fetch(`/api/gifs?q=${encodeURIComponent(query || 'happy')}`, { signal: controller.signal, credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load GIFs.')
      }
      const items = Array.isArray(result.gifs) ? result.gifs : []
      setGifs(items.filter((gif) => gif?.url))
      if (items.length === 0) {
        setGifError('No GIFs matched your search.')
      }
      return () => controller.abort()
    } catch (loadError) {
      if (loadError?.name !== 'AbortError') {
        setGifError('Couldn\'t load GIFs')
      }
    } finally {
      setGifsLoading(false)
    }
    return undefined
  }

  useEffect(() => {
    if (!pickerOpen || pickerCategory !== 'GIFs') return undefined
    const timer = window.setTimeout(() => {
      void loadGifs(pickerSearch)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [pickerOpen, pickerCategory, pickerSearch])

  const sendMessage = async (event) => {
    event.preventDefault()
    const trimmedBody = body.trim()
    const hasInlineMedia = !!selectedMedia
    if ((!trimmedBody && !mediaFile && !hasInlineMedia) || videoTooLarge || !otherUserId) return

    setSending(true)
    try {
      let uploadedMediaUrl = null
      let uploadedMediaType = null
      let messageType = 'text'
      if (selectedMedia) {
        uploadedMediaUrl = selectedMedia.url
        uploadedMediaType = selectedMedia.type
        messageType = selectedMedia.type
      }
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
        messageType = mediaType || 'image'
      }

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ recipientId: otherUserId, body: trimmedBody || (messageType === 'gif' ? 'GIF' : messageType === 'sticker' ? 'Sticker' : ''), mediaUrl: uploadedMediaUrl, mediaType: uploadedMediaType, messageType, replyToMessageId: replyTo?.id || null }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.')
      setMessages((previous) => {
        const merged = [...previous, { ...result.message, sender_user: currentUser, recipient_user: otherUser }]
        const seen = new Map(merged.map((message) => [message.id, message]))
        const ordered = [...seen.values()].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        return ordered
      })
      scrollIntentRef.current = 'send'
      setBody('')
      if (typingStartTimeoutRef.current) window.clearTimeout(typingStartTimeoutRef.current)
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
      void trackTyping(false)
      setMediaFile(null)
      setMediaPreview('')
      setMediaType(null)
      setSelectedMedia(null)
      setReplyTo(null)
      setActionMessageId(null)
      setAttachmentMenuOpen(false)
      setPickerOpen(false)
      window.dispatchEvent(new Event('daet-messages-updated'))
      window.dispatchEvent(new Event('daet-notifications-updated'))
      if (mediaInputRef.current) mediaInputRef.current.value = ''
    } catch (sendError) {
      setError(sendError.message)
    } finally {
      setSending(false)
    }
  }

  const chooseEmoji = (emoji) => {
    setBody((previous) => `${previous}${emoji}`)
  }

  const chooseMedia = (type, url) => {
    setSelectedMedia({ type, url })
    setAttachmentMenuOpen(false)
    setPickerOpen(false)
    setPickerSearch('')
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

  const handleAttachmentAction = (action) => {
    setAttachmentMenuOpen(false)
    if (action === 'photo-video') {
      mediaInputRef.current?.click()
      return
    }
    if (action === 'gif') {
      setPickerCategory('GIFs')
      setPickerSearch('')
      setPickerOpen(true)
      return
    }
    if (action === 'sticker') {
      setPickerCategory('Stickers')
      setPickerSearch('')
      setPickerOpen(true)
    }
  }

  const getReplyPreview = (message) => {
    if (!message) return 'Original message was deleted'
    if (message.body) return message.body
    if (message.media_type === 'gif') return 'GIF'
    if (message.media_type === 'sticker') return 'Sticker'
    if (message.media_type === 'video') return 'Video'
    if (message.media_type === 'image') return 'Photo'
    return 'Original message was deleted'
  }

  return (
    <main className="conversation-page flex w-full flex-col overflow-hidden bg-[#eef4f5] text-slate-900" style={{ height: viewportHeight, minHeight: viewportHeight, maxHeight: viewportHeight }}>
      <div className="conversation-shell flex h-full min-h-0 w-full flex-col overflow-hidden">
        <header className="conversation-header flex flex-[0_0_auto] items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/user/messaging') }} aria-label="Back to messages" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {otherUser && (
            <UserProfileLink user={otherUser} className="flex min-w-0 items-center gap-3">
              <ProfileAvatar user={otherUser} size="h-10 w-10" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#147d75]">Conversation</p>
                <h1 className="truncate text-base font-black text-slate-950">{otherUser.full_name || 'Community member'}</h1>
              </div>
            </UserProfileLink>
          )}
        </header>

        {messageToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
            <div role="alertdialog" aria-modal="true" aria-labelledby="delete-message-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
              <h2 id="delete-message-title" className="text-base font-black text-slate-950">Delete this message?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">This message will be removed.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setMessageToDelete(null)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={deleteMessage} className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}

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
          <div className="messages-container min-h-0 flex-1 overflow-hidden bg-white text-center text-sm text-red-700">
            <div className="p-8">
              <p className="font-semibold">{error}</p>
              <button type="button" onClick={retryConversation} className="mt-4 rounded-full bg-[#147d75] px-5 py-2 text-sm font-bold text-white hover:bg-[#0f685f]">Retry</button>
            </div>
          </div>
        ) : (
          <>
            <div className="messages-container relative min-h-0 flex-1 w-full overflow-hidden bg-white">
              <div ref={messagesScrollRef} onScroll={handleMessagesScroll} className="messages-scroll h-full min-h-0 w-full space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain">
              {messages.length ? messages.map((message) => {
                const isOwnMessage = message.sender_id === currentUser?.id
                const sender = isOwnMessage ? currentUser : otherUser
                const originalMessage = messages.find((candidate) => candidate.id === message.reply_to_message_id)
                const isActionOpen = actionMessageId === message.id
                const isHighlighted = highlightedMessageId === message.id
                return (
                  <div id={`message-${message.id}`} key={message.id} className={`flex items-end gap-2 px-4 transition-colors duration-500 sm:px-6 ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isHighlighted ? 'bg-amber-50' : ''}`}>
                    {!isOwnMessage && <UserProfileLink user={sender} ariaLabel={`Open ${sender?.full_name || 'user'} profile`}><ProfileAvatar user={sender} size="h-8 w-8" /></UserProfileLink>}
                    <div
                      ref={isActionOpen ? selectedMessageRef : null}
                      data-message-id={message.id}
                      onContextMenu={(event) => { event.preventDefault(); setActionMessageId(message.id) }}
                      onPointerDown={(event) => handleMessagePointerDown(event, message.id)}
                      onPointerMove={handleMessagePointerMove}
                      onPointerUp={(event) => handleMessagePointerUp(event, message.id)}
                      onPointerCancel={handleMessagePointerCancel}
                      style={{ touchAction: 'pan-y', transform: swipeState.id === message.id ? `translateX(${swipeState.offset}px)` : undefined }}
                      className="message-wrapper relative max-w-[80%] transition-transform duration-150"
                    >
                      {swipeState.id === message.id && Math.abs(swipeState.offset) > 10 && <div className={`absolute inset-y-0 flex items-center text-[#147d75] ${swipeState.offset >= 0 ? '-left-9' : '-right-9'}`}><CornerUpLeft className="h-5 w-5" /></div>}
                      <div className={`rounded-2xl px-3 py-2 text-sm leading-5 ${isOwnMessage ? 'bg-[#147d75] text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {message.reply_to_message_id && <button type="button" onClick={() => scrollToMessage(message.reply_to_message_id)} className={`mb-2 block w-full border-l-2 pl-2 text-left text-xs ${isOwnMessage ? 'border-white/60 text-white/80' : 'border-[#147d75] text-slate-500'}`}><span className="block font-bold">↪ {originalMessage ? (originalMessage.sender_id === currentUser?.id ? currentUser?.full_name : otherUser?.full_name) || 'Community member' : 'Original message was deleted'}</span><span className="block truncate">{getReplyPreview(originalMessage)}</span></button>}
                        {message.media_url && (message.message_type === 'video' || message.media_type === 'video' ? <video src={message.media_url} controls className="mb-2 max-h-72 max-w-full rounded-lg" /> : <img src={message.media_url} alt="Shared attachment" className="mb-2 max-h-72 max-w-full rounded-lg object-contain" />)}
                        {message.body && <p>{message.body}</p>}
                        <time className={`mt-1 block text-[10px] ${isOwnMessage ? 'text-white/70' : 'text-slate-400'}`}>{message.created_at ? new Date(message.created_at).toLocaleString() : 'Recently'}{isOwnMessage && message.read_at ? ' · Seen' : ''}</time>
                      </div>
                      {isActionOpen && <div onPointerDown={(event) => event.stopPropagation()} className={`message-action-menu absolute z-10 flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-lg ${isOwnMessage ? 'right-0' : 'left-0'} -top-11`}><button type="button" onClick={() => selectReply(message)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"><CornerUpLeft className="h-3.5 w-3.5" /> Reply</button><button type="button" onClick={() => { setMessageToDelete(message); setActionMessageId(null) }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div>}
                    </div>
                    {isOwnMessage && <ProfileAvatar user={currentUser} size="h-8 w-8" />}
                  </div>
                )
              }) : <p className="py-10 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>}
              </div>
              {showNewMessageIndicator && !isNearBottom && (
                <button
                  type="button"
                  onClick={() => scrollConversationToBottom('smooth')}
                  className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#147d75] px-3 py-1.5 text-xs font-bold text-white shadow-lg transition hover:bg-[#0f685f]"
                >
                  New messages
                </button>
              )}
            </div>
            <div className="message-composer relative flex flex-[0_0_auto] w-full flex-col bg-white">
              {otherUserTyping && <p className="border-t border-slate-100 px-4 pt-2 text-left text-xs font-semibold text-slate-500">{otherUser?.full_name || 'Community member'} is typing...</p>}
              {replyTo && <div className="flex items-start gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4"><CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-[#147d75]" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">Replying to {replyTo.sender_id === currentUser?.id ? currentUser?.full_name || 'You' : otherUser?.full_name || 'Community member'}</p><p className="truncate text-xs text-slate-500">{getReplyPreview(replyTo)}</p></div><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" title="Cancel reply" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button></div>}
              {selectedMedia && <div className="shrink-0 border-t border-slate-200 px-3 pt-3 sm:px-4"><div className="relative w-fit max-w-full rounded-lg bg-slate-100 p-2"><img src={selectedMedia.url} alt={selectedMedia.type === 'sticker' ? 'Sticker preview' : selectedMedia.type === 'gif' ? 'GIF preview' : 'Attachment preview'} className="max-h-32 max-w-full rounded object-contain" /><button type="button" onClick={() => setSelectedMedia(null)} aria-label="Remove selected media" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white"><X className="h-3.5 w-3.5" /></button></div></div>}
              {mediaPreview && <div className="shrink-0 border-t border-slate-200 px-3 pt-3 sm:px-4"><div className="relative w-fit max-w-full rounded-lg bg-slate-100 p-2">{mediaType === 'video' ? <video src={mediaPreview} controls className="max-h-32 max-w-full rounded" /> : <img src={mediaPreview} alt="Attachment preview" className="max-h-32 max-w-full rounded object-contain" />}<button type="button" onClick={clearMedia} aria-label="Remove attachment" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white"><X className="h-3.5 w-3.5" /></button></div></div>}
              <form onSubmit={sendMessage} className="message-composer-row relative flex shrink-0 items-center gap-2 border-t border-slate-200 p-3 sm:p-4">
                <input ref={mediaInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={handleMediaChange} className="hidden" />
                <div className="relative flex shrink-0 items-center">
                  <button type="button" onClick={() => setAttachmentMenuOpen((open) => !open)} aria-label="Open attachment menu" title="Add attachment" className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"> <Plus className="h-5 w-5" /> </button>
                  {attachmentMenuOpen && <div ref={attachmentMenuRef} className="absolute bottom-[calc(100%+0.75rem)] left-0 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <button type="button" onClick={() => handleAttachmentAction('photo-video')} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"><span className="text-base">🖼️</span>Photo / Video</button>
                    <button type="button" onClick={() => handleAttachmentAction('gif')} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"><span className="text-base">🎞️</span>GIF</button>
                    <button type="button" onClick={() => handleAttachmentAction('sticker')} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"><span className="text-base">🏷️</span>Sticker</button>
                  </div>}
                </div>
                <div className="message-input-wrapper relative min-w-0 flex-1">
                  <textarea value={body} onChange={handleBodyChange} placeholder="Write a message..." rows={1} className="message-input h-12 w-full resize-none border border-slate-200 bg-slate-50 px-3 py-2.5 pr-11 text-sm outline-none focus:border-[#147d75]" />
                  <button type="button" onClick={() => setPickerOpen((open) => !open)} aria-label="Open emoji picker" title="Emoji picker" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200"><Smile className="h-4 w-4" /></button>
                </div>
                <button type="submit" disabled={sending || videoTooLarge || (!body.trim() && !mediaFile && !selectedMedia)} className="send-button inline-flex h-12 shrink-0 items-center justify-center gap-2 bg-[#147d75] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending' : 'Send'}</button>
              </form>
              {pickerOpen && <div ref={pickerRef} className="absolute bottom-[calc(100%+1rem)] left-0 right-0 z-30 mx-2 flex max-h-[min(24rem,65dvh)] flex-col overflow-hidden border border-slate-200 bg-white shadow-xl sm:left-auto sm:w-[min(26rem,calc(100%-1rem))]">
                {pickerCategory === 'GIFs' ? (
                  <>
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search GIFs..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                      {gifsLoading ? <div className="flex items-center justify-center py-10 text-sm text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Loading GIFs...</div> : gifError ? <div className="flex min-h-45 flex-col items-center justify-center gap-3 py-8 text-center text-sm text-slate-600"><p>Couldn&apos;t load GIFs</p><button type="button" onClick={() => void loadGifs(pickerSearch || 'happy')} className="rounded-full bg-[#147d75] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f685f]">Try again</button></div> : gifs.length ? <div className="grid grid-cols-2 gap-2">{gifs.map((gif) => <button key={gif.id} type="button" onClick={() => chooseMedia('gif', gif.url)} className="overflow-hidden rounded-xl bg-slate-100 hover:ring-2 hover:ring-[#147d75]"><img src={gif.url} alt={gif.title} className="h-24 w-full object-cover" /></button>)}</div> : <p className="py-10 text-center text-sm text-slate-500">No GIFs found.</p>}
                    </div>
                  </>
                ) : pickerCategory === 'Stickers' ? (
                  <>
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search stickers..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
                      <div className="grid grid-cols-2 gap-3">{STICKER_PHRASES.filter((sticker) => sticker.toLowerCase().includes(pickerSearch.toLowerCase())).map((sticker) => <button key={sticker} type="button" onClick={() => chooseMedia('sticker', createStickerUrl(sticker))} className="overflow-hidden rounded-2xl bg-slate-50 p-1 shadow-sm hover:ring-2 hover:ring-[#147d75]"><img src={createStickerUrl(sticker)} alt={sticker} className="w-full rounded-xl" /></button>)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search emoji" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
                    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-2 py-2">{Object.keys(EMOJI_CATEGORIES).map((category) => <button key={category} type="button" onClick={() => { setPickerCategory(category); setPickerSearch('') }} className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${pickerCategory === category ? 'bg-[#147d75] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{category}</button>)}</div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"><div className="grid grid-cols-7 gap-1">{(EMOJI_CATEGORIES[pickerCategory] || []).filter((emoji) => !pickerSearch || emoji.includes(pickerSearch)).map((emoji, index) => <button key={`${emoji}-${index}`} type="button" onClick={() => chooseEmoji(emoji)} className="flex aspect-square items-center justify-center rounded-lg text-2xl hover:bg-slate-100">{emoji}</button>)}</div></div>
                  </>
                )}
              </div>}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
