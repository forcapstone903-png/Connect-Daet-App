'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  AlertCircle,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  Eye,
  FilePenLine,
  Info,
  MapPin,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Send,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import MediaUpload from '@/app/(subsystems)/info/components/MediaUpload'
import MultiMediaUpload from '@/app/(subsystems)/info/components/MultiMediaUpload'
import RichTextEditor from '@/app/(subsystems)/info/components/user/RichTextEditor'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { SectionLoading } from '@/app/(subsystems)/info/components/user/UserSectionHeader'
import { normalizeErrorMessage, trackUserActivity } from '@/lib/trackActivity'
import { getStoredSessionObject } from '@/lib/authCookies'
import { getCacheKey, invalidateCache } from '@/lib/cache'

const categories = [
  { value: 'travel_guides', label: 'Travel Guides' },
  { value: 'cultural_insights', label: 'Cultural Insights' },
  { value: 'food', label: 'Food' },
  { value: 'history', label: 'History' },
  { value: 'events', label: 'Events' },
  { value: 'announcement', label: 'Announcements' },
]

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  category: 'travel_guides',
  featured_image: '',
  tags: '',
  location: '',
  status: 'draft',
}

const POST_SUBMIT_DELAY_MS = 700
const AUTOSAVE_DELAY_MS = 1800

const shareOptions = [
  {
    id: 'blog',
    title: 'Story / Blog',
    description: 'Share a travel story, guide, or local discovery for administrator review.',
    icon: BookOpenText,
  },
  {
    id: 'forum',
    title: 'Forum Discussion',
    description: 'Start a conversation with the community.',
    icon: MessageCircle,
  },
  {
    id: 'event',
    title: 'Event',
    description: 'Suggest a community event for administrator review before it is published.',
    icon: CalendarDays,
  },
  {
    id: 'feedback',
    title: 'Daily Feedback',
    description: 'Share a suggestion or report with the Daet team.',
    icon: MessageSquare,
  },
]

function plainTextFromHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function sanitizePreviewHtml(html) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const allowedTags = new Set(['P', 'H1', 'H2', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'A', 'STRONG', 'EM', 'U', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG', 'HR'])
  const safeContainer = document.createElement('div')

  const copyNode = (node, parent) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.append(document.createTextNode(node.textContent || ''))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tagName = { B: 'STRONG', I: 'EM', DIV: 'P' }[node.tagName] || node.tagName
    if (!allowedTags.has(tagName)) {
      node.childNodes.forEach((child) => copyNode(child, parent))
      return
    }

    const safeElement = document.createElement(tagName.toLowerCase())
    if (tagName === 'A') {
      try {
        const url = new URL(node.getAttribute('href') || '')
        if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          safeElement.setAttribute('href', url.href)
          safeElement.setAttribute('target', '_blank')
          safeElement.setAttribute('rel', 'noopener noreferrer')
        }
      } catch {
        // Invalid links are rendered as plain text.
      }
    }
    if (tagName === 'IMG') {
      try {
        const url = new URL(node.getAttribute('src') || '')
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          safeElement.setAttribute('src', url.href)
          safeElement.setAttribute('alt', node.getAttribute('alt') || '')
        } else {
          return
        }
      } catch {
        return
      }
    } else {
      node.childNodes.forEach((child) => copyNode(child, safeElement))
    }
    parent.append(safeElement)
  }

  parsed.body.childNodes.forEach((child) => copyNode(child, safeContainer))
  return safeContainer.innerHTML
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function CreateBlogPage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY_FORM)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [shareType, setShareType] = useState('blog')
  const [forumForm, setForumForm] = useState({ title: '', content: '', tags: '', location: '' })
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    location: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    category: 'festival',
    organizer: '',
    is_free: true,
    ticket_price: '',
  })
  const [feedbackForm, setFeedbackForm] = useState({ category: 'suggestion', message: '', rating: 5, location: '', image: '' })
  const [mediaItems, setMediaItems] = useState([])
  const [forumMediaItems, setForumMediaItems] = useState([])
  const [mediaLayout, setMediaLayout] = useState('swipe')
  const [previewMode, setPreviewMode] = useState(false)
  const [visibility, setVisibility] = useState('public')
  const [autosaveStatus, setAutosaveStatus] = useState('idle')
  const [autosaveWarning, setAutosaveWarning] = useState('')
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  const [mobileOverflowOpen, setMobileOverflowOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastIsError, setToastIsError] = useState(false)
  const [successStatus, setSuccessStatus] = useState('published')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [wordCount, setWordCount] = useState(0)
  const [restoredUnsavedChanges, setRestoredUnsavedChanges] = useState(false)
  const [editorContentRevision, setEditorContentRevision] = useState(0)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [galleryProgress, setGalleryProgress] = useState(0)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingFeedbackImage, setUploadingFeedbackImage] = useState(false)
  const [coverUploadError, setCoverUploadError] = useState('')
  const draftIdRef = useRef(null)
  const currentSlugRef = useRef('')
  const slugTitleRef = useRef('')
  const savedSnapshotRef = useRef('')
  const savePromiseRef = useRef(null)
  const toastTimeoutRef = useRef(null)
  const editorRef = useRef(null)
  const mobileOverflowRef = useRef(null)
  const galleryUploadRef = useRef(null)
  const pendingFilesRef = useRef(null)
  const currentPayloadRef = useRef(null)
  const localBackupLoadedRef = useRef('')
  const drawerTouchStartYRef = useRef(null)

  const showToast = useCallback((message, isError = false) => {
    setToastMessage(message)
    setToastIsError(isError)
    window.clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(''), isError ? 6000 : 3500)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimeoutRef.current), [])

  useEffect(() => {
    if (!mobileOverflowOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!mobileOverflowRef.current?.contains(event.target)) setMobileOverflowOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileOverflowOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileOverflowOpen])

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession()
      const storedSession = getStoredSessionObject()
      const user = data.session?.user || (storedSession?.user_id || storedSession?.id || storedSession?.sub || storedSession?.userId
        ? {
            id: storedSession.user_id || storedSession.id || storedSession.sub || storedSession.userId,
            email: storedSession.email || storedSession.user_email,
            user_metadata: {
              full_name: storedSession.full_name || storedSession.user_name || '',
              avatar_url: storedSession.avatar_url || storedSession.profile_image_url || '',
            },
          }
        : null)
      setSession(user ? { user } : null)
      setLoading(false)
    }

    getSession()
  }, [])

  useEffect(() => {
    if (!mobileSettingsOpen) return undefined
    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileSettingsOpen(false)
    }

    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.documentElement.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      document.documentElement.style.overflow = previousDocumentOverflow
      window.removeEventListener('keydown', closeOnEscape)
      window.scrollTo(0, scrollY)
    }
  }, [mobileSettingsOpen])

  useEffect(() => {
    if (!mobileSettingsOpen || !pendingFilesRef.current) return undefined
    const files = pendingFilesRef.current
    pendingFilesRef.current = null
    const timer = window.setTimeout(async () => {
      const uploaded = await galleryUploadRef.current?.uploadFiles(files)
      const firstImage = uploaded?.find((item) => item.type === 'image')
      if (firstImage && !editorRef.current?.replaceImage(firstImage)) editorRef.current?.insertImage(firstImage)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [mobileSettingsOpen])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setAutosaveStatus((current) => current === 'saving' ? current : 'idle')
  }

  const getBlogPayload = useCallback((status) => {
    const bodyText = plainTextFromHtml(form.content)
    const title = form.title.trim() || (mediaItems.length
      ? 'Community media post'
      : status === 'draft' && bodyText ? 'Untitled story' : '')
    if (slugTitleRef.current !== title && title) {
      slugTitleRef.current = title
      currentSlugRef.current = `${generateSlug(title)}-${Date.now()}`
    }

    return {
      title,
      slug: currentSlugRef.current,
      excerpt: form.excerpt.trim() || bodyText.slice(0, 180) || 'Shared photos and videos with the community.',
      content: form.content.trim() || (mediaItems.length ? 'Shared photos and videos with the community.' : ''),
      featured_image: typeof form.featured_image === 'string' ? form.featured_image.trim() || null : null,
      images: mediaItems.filter((media) => media.type === 'image').map((media) => media.url),
      videos: mediaItems.filter((media) => media.type === 'video').map((media) => media.url),
      media_layout: mediaLayout,
      category: form.category,
      tags: (Array.isArray(form.tags) ? form.tags : typeof form.tags === 'string' ? form.tags.split(',') : [])
        .map((tag) => String(tag).trim())
        .filter(Boolean),
      location: form.location.trim(),
      status,
    }
  }, [form, mediaItems, mediaLayout])

  useEffect(() => {
    currentPayloadRef.current = getBlogPayload('draft')
  }, [getBlogPayload])

  const writeLocalBackup = useCallback((payload) => {
    const userId = session?.user?.id
    if (!userId) return
    const draftId = draftIdRef.current || 'new'
    const backup = {
      payload,
      draftId: draftIdRef.current,
      mediaItems,
      mediaLayout,
      visibility,
      updatedAt: Date.now(),
    }
    try {
      window.localStorage.setItem(`content-studio-draft:${userId}:${draftId}`, JSON.stringify(backup))
      window.localStorage.setItem(`content-studio-latest-draft:${userId}`, String(draftId))
    } catch (error) {
      console.warn('Unable to store a local story backup:', error)
    }
  }, [mediaItems, mediaLayout, session?.user?.id, visibility])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || localBackupLoadedRef.current === userId) return
    localBackupLoadedRef.current = userId

    let draftId
    let backupText
    try {
      const latestDraftId = window.localStorage.getItem(`content-studio-latest-draft:${userId}`)
      draftId = latestDraftId && latestDraftId !== 'new' ? latestDraftId : null
      backupText = window.localStorage.getItem(`content-studio-draft:${userId}:${draftId || 'new'}`)
    } catch (error) {
      console.warn('Local story recovery is unavailable:', error)
      return
    }
    if (!backupText) return

    let backup
    try {
      backup = JSON.parse(backupText)
    } catch (error) {
      console.warn('Unable to read the local story backup:', error)
      try {
        window.localStorage.removeItem(`content-studio-draft:${userId}:${draftId || 'new'}`)
        window.localStorage.removeItem(`content-studio-latest-draft:${userId}`)
      } catch (storageError) {
        console.warn('Unable to clear the invalid local story backup:', storageError)
      }
      return
    }

    const restoreBackup = (payload) => {
      const restoredPayload = {
        ...payload,
        content: sanitizePreviewHtml(payload.content || ''),
        featured_image: typeof payload.featured_image === 'string' ? payload.featured_image : '',
        tags: Array.isArray(payload.tags) ? payload.tags.join(', ') : typeof payload.tags === 'string' ? payload.tags : '',
      }
      setEditorContentRevision((revision) => revision + 1)
      setForm((current) => ({ ...current, ...restoredPayload }))
      setMediaItems(backup.mediaItems || [])
      setMediaLayout(backup.mediaLayout || 'swipe')
      setVisibility(backup.visibility || 'public')
      if (backup.draftId) draftIdRef.current = backup.draftId
      if (restoredPayload.title) {
        slugTitleRef.current = restoredPayload.title
        currentSlugRef.current = restoredPayload.slug || ''
      }
      setRestoredUnsavedChanges(true)
      setAutosaveStatus('idle')
      showToast('Your saved story was restored.')
    }

    if (!draftId) {
      restoreBackup(backup.payload || {})
      return
    }

    fetch(`/info/api/user/blogs/${encodeURIComponent(draftId)}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to check the saved draft (${response.status}).`)
        const result = await response.json()
        if (!result.success || !result.blog) throw new Error(result.message || 'Unable to load the saved draft.')
        const serverUpdatedAt = new Date(result.blog.updated_at || 0).getTime()
        if (serverUpdatedAt >= Number(backup.updatedAt || 0)) {
          const blog = result.blog
          draftIdRef.current = blog.id
          setEditorContentRevision((revision) => revision + 1)
          setForm((current) => ({
            ...current,
            title: blog.title || '',
            excerpt: blog.excerpt || '',
            content: blog.content || '',
            category: blog.category || current.category,
            featured_image: blog.featured_image || '',
            tags: Array.isArray(blog.tags) ? blog.tags.join(', ') : '',
            location: blog.location || '',
          }))
          setMediaItems([
            ...(Array.isArray(blog.images) ? blog.images.map((url) => ({ url, type: 'image' })) : []),
            ...(Array.isArray(blog.videos) ? blog.videos.map((url) => ({ url, type: 'video' })) : []),
          ])
          setMediaLayout(blog.media_layout || 'swipe')
          setVisibility(blog.status === 'draft' ? 'draft' : 'public')
          setLastSavedAt(blog.updated_at ? new Date(blog.updated_at) : null)
          slugTitleRef.current = blog.title || ''
          currentSlugRef.current = blog.slug || ''
          setRestoredUnsavedChanges(true)
          setAutosaveStatus('saved')
          showToast('Your saved story was restored.')
        } else {
          restoreBackup(backup.payload || {})
        }
      })
      .catch((error) => {
        console.warn('Unable to compare local and server drafts:', normalizeErrorMessage(error))
        restoreBackup(backup.payload || {})
      })
  }, [session?.user?.id, showToast])

  useEffect(() => {
    if (!session?.user?.id || !currentPayloadRef.current) return
    const payload = currentPayloadRef.current
    if (!payload.title && !payload.excerpt && !plainTextFromHtml(payload.content)) return
    const timer = window.setTimeout(() => writeLocalBackup(payload), 350)
    return () => window.clearTimeout(timer)
  }, [form, mediaItems, mediaLayout, session?.user?.id, visibility, writeLocalBackup])

  const persistBlogPayload = useCallback(async (payload, { keepalive = false } = {}) => {
    writeLocalBackup(payload)
    const previousSave = savePromiseRef.current
    const operation = (async () => {
      if (previousSave) {
        try {
          await previousSave
        } catch {
          console.warn('Retrying after a previous draft save failed.')
        }
      }

      const isUpdate = Boolean(draftIdRef.current)
      const response = await fetch(
        isUpdate ? `/info/api/user/blogs/${draftIdRef.current}` : '/info/api/user/blogs',
        {
        method: isUpdate ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        keepalive,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to save your story.')
      }
      const savedId = result.blog?.id || result.blog_id
      if (savedId) draftIdRef.current = savedId
      writeLocalBackup(payload)
      if (payload.status === 'draft') savedSnapshotRef.current = JSON.stringify(payload)
      return result
    })()
    savePromiseRef.current = operation

    try {
      return await operation
    } finally {
      if (savePromiseRef.current === operation) savePromiseRef.current = null
    }
  }, [writeLocalBackup])

  const saveDraftOnLeave = useCallback(() => {
    if (shareType !== 'blog' || success || !session?.user?.id) return
    const payload = getBlogPayload('draft')
    if (!payload.title || !plainTextFromHtml(payload.content)) return
    void persistBlogPayload(payload, { keepalive: true }).catch((error) => {
      console.warn('Unable to save the story while leaving:', normalizeErrorMessage(error))
    })
  }, [getBlogPayload, persistBlogPayload, session?.user?.id, shareType, success])

  useEffect(() => {
    if (shareType !== 'blog' || success) return undefined
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveDraftOnLeave()
    }
    const saveBeforeInternalNavigation = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[href]')
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      try {
        const destination = new URL(link.href, window.location.href)
        if (destination.origin === window.location.origin && destination.href !== window.location.href) saveDraftOnLeave()
      } catch {
        console.warn('Unable to determine whether the story navigation is internal.')
      }
    }
    document.addEventListener('visibilitychange', saveWhenHidden)
    document.addEventListener('click', saveBeforeInternalNavigation, true)
    window.addEventListener('pagehide', saveDraftOnLeave)
    return () => {
      document.removeEventListener('visibilitychange', saveWhenHidden)
      document.removeEventListener('click', saveBeforeInternalNavigation, true)
      window.removeEventListener('pagehide', saveDraftOnLeave)
    }
  }, [saveDraftOnLeave, shareType, success])

  useEffect(() => {
    if (shareType !== 'blog' || success || submitting || previewMode) return undefined
    const payload = getBlogPayload('draft')
    if (!payload.title || !plainTextFromHtml(payload.content)) return undefined
    const snapshot = JSON.stringify(payload)
    if (snapshot === savedSnapshotRef.current) return undefined

    const timeout = window.setTimeout(async () => {
      const isFirstSave = !draftIdRef.current
      setAutosaveStatus('saving')
      try {
        const result = await persistBlogPayload(payload)
        savedSnapshotRef.current = snapshot
        setLastSavedAt(new Date())
        setAutosaveWarning(result.warning || '')
        if (isFirstSave) showToast(result.warning ? 'Your story was saved as a draft with some media limits.' : 'Your story was saved as a draft.')
        if (JSON.stringify(currentPayloadRef.current) === snapshot) {
          setAutosaveStatus(result.warning ? 'warning' : 'saved')
        }
      } catch (error) {
        const errorMessage = normalizeErrorMessage(error)
        console.warn('Story autosave failed:', errorMessage)
        setAutosaveStatus('error')
        showToast(`Draft save failed: ${errorMessage}`, true)
      }
    }, AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [getBlogPayload, persistBlogPayload, previewMode, shareType, showToast, submitting, success])

  const handleSubmit = async (event, blogStatus = 'published') => {
    event?.preventDefault()

    if (!session?.user) {
      alert('Please log in before creating content.')
      return
    }

    if (shareType === 'blog') {
      const payload = getBlogPayload(blogStatus)
      if (!payload.title || !plainTextFromHtml(payload.content)) {
        alert('Add a title and some story text before saving or publishing.')
        return
      }
      if (!payload.category) {
        alert('Choose a story category before publishing.')
        return
      }
      if (uploadingGallery || uploadingCover) {
        alert('Wait for your media uploads to finish before publishing.')
        return
      }

      setSubmitting(true)
      setAutosaveStatus('saving')
      try {
        const result = await persistBlogPayload(payload)
        const savedId = result.blog?.id || draftIdRef.current
        savedSnapshotRef.current = JSON.stringify({ ...payload, status: 'draft' })
        setLastSavedAt(new Date())
        setAutosaveWarning(result.warning || '')
        setSuccessStatus(blogStatus)
        if (blogStatus === 'draft') showToast('Your blog was saved as a draft.')
        if (blogStatus === 'published' && session?.user?.id) {
          try {
            window.localStorage.removeItem(`content-studio-draft:${session.user.id}:${savedId || 'new'}`)
            window.localStorage.removeItem(`content-studio-draft:${session.user.id}:new`)
            window.localStorage.removeItem(`content-studio-latest-draft:${session.user.id}`)
          } catch (error) {
            console.warn('Unable to clear the local story backup:', error)
          }
        }
        if (blogStatus === 'published') {
          invalidateCache(getCacheKey('feed', 'user', session.user.id, 'dashboard'))
          void trackUserActivity({
            userId: session.user.id,
            activityType: 'new_post',
            entityType: 'blog',
            entityId: savedId,
            description: `Submitted a blog post for approval: ${payload.title}`,
            metadata: { contentTitle: payload.title, ownerUserId: session.user.id },
          }).catch((activityError) => console.warn('Blog activity tracking failed:', activityError))
        }
        setSuccess(true)
        setAutosaveStatus(result.warning ? 'warning' : 'saved')
        if (result.warning) window.alert(result.warning)
        const destination = blogStatus === 'published'
          ? '/info/user/blog-submissions'
          : '/info/user/drafts'
        window.setTimeout(() => router.push(destination), 1200)
      } catch (error) {
        const errorMessage = normalizeErrorMessage(error)
        console.warn('Error saving story:', errorMessage)
        alert(errorMessage)
        setAutosaveStatus('error')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (shareType === 'event' && (!eventForm.title.trim() || !eventForm.description.trim() || !eventForm.start_date)) {
      alert('Please add an event title, description, and start date.')
      return
    }
    if (shareType === 'forum' && (!forumForm.title.trim() || !forumForm.content.trim())) {
      alert('Please add a discussion title and message.')
      return
    }
    if (shareType === 'feedback' && !feedbackForm.message.trim()) {
      alert('Please add your feedback message.')
      return
    }
    if (uploadingGallery || uploadingFeedbackImage || uploadingCover) {
      alert('Wait for your attachments to finish uploading before submitting.')
      return
    }

    setSubmitting(true)
    try {
      await new Promise((resolve) => window.setTimeout(resolve, POST_SUBMIT_DELAY_MS))
      const forumPayload = {
        title: forumForm.title.trim(),
        content: forumForm.content.trim(),
        tags: forumForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        location: forumForm.location.trim(),
        attachments: forumMediaItems.map((media) => media.url),
      }
      const feedbackPayload = {
        category: feedbackForm.category,
        rating: feedbackForm.rating,
        message: feedbackForm.message.trim(),
        location: feedbackForm.location.trim(),
        images: feedbackForm.image ? [feedbackForm.image] : [],
      }
      const eventPayload = {
        ...eventForm,
        title: eventForm.title.trim(),
        description: eventForm.description.trim(),
        location: eventForm.location.trim(),
        organizer: eventForm.organizer.trim(),
        ticket_price: eventForm.ticket_price,
      }
      const response = await fetch('/info/api/posts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareType, forumForm: forumPayload, feedbackForm: feedbackPayload, eventForm: eventPayload }),
      })
      const result = await response.json().catch(() => ({ success: false, message: 'Unable to create content.' }))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to create content.')

      if (result.warning) window.alert(result.warning)
      setSuccess(true)
      const destinations = {
        forum: '/info/visitor/forum',
        feedback: '/info/user/feedback',
        event: '/info/user/event-submissions',
      }
      window.setTimeout(() => router.push(destinations[shareType] || '/info/user/dashboard'), 1200)
    } catch (error) {
      const errorMessage = normalizeErrorMessage(error)
      console.warn('Error creating content:', errorMessage)
      alert(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const authorName = session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || session?.user?.email?.split('@')[0]
    || 'Daet community member'
  const authorAvatar = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || ''
  const selectedCategory = categories.find((category) => category.value === form.category)?.label || form.category
  const activeLocation = shareType === 'blog'
    ? form.location
    : shareType === 'forum'
      ? forumForm.location
      : shareType === 'event'
        ? eventForm.location
        : feedbackForm.location
  const renderSettingsPanel = () => (
    <div
      className="content-studio-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setMobileSettingsOpen(false)
      }}
    >
      <aside
        className="content-studio-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Content settings"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => { drawerTouchStartYRef.current = event.touches[0]?.clientY ?? null }}
        onTouchEnd={(event) => {
          const endY = event.changedTouches[0]?.clientY ?? 0
          const scrollArea = event.target.closest('.content-studio-panel-scroll')
          if (drawerTouchStartYRef.current !== null && endY - drawerTouchStartYRef.current > 100 && (!scrollArea || scrollArea.scrollTop <= 0)) {
            setMobileSettingsOpen(false)
          }
          drawerTouchStartYRef.current = null
        }}
      >
        <div className="content-studio-panel">
          <div className="content-studio-panel-heading">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Workspace settings</p>
              <h2 className="mt-1 text-lg font-black text-slate-950">Edit & publish</h2>
            </div>
            <Link href="/info/user/drafts" className="content-studio-icon-action" aria-label="View drafts" title="View drafts">
              <FilePenLine className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => setMobileSettingsOpen(false)} className="content-studio-close" aria-label="Close settings">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="content-studio-panel-scroll">
            <details className="content-studio-section" open>
              <summary>Content settings</summary>
              <div className="space-y-3">
                {(shareType === 'blog' || shareType === 'feedback' || shareType === 'event') && (
                  <label className="block text-xs font-semibold text-slate-600">
                    {shareType === 'blog' ? 'Category' : shareType === 'event' ? 'Event category' : 'Feedback category'}
                    <select
                      value={shareType === 'blog' ? form.category : shareType === 'event' ? eventForm.category : feedbackForm.category}
                      onChange={(event) => shareType === 'blog'
                        ? updateField('category', event.target.value)
                        : shareType === 'event'
                          ? setEventForm((current) => ({ ...current, category: event.target.value }))
                          : setFeedbackForm((current) => ({ ...current, category: event.target.value }))}
                      className="content-studio-setting-input"
                    >
                      {shareType === 'blog' ? categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>) : shareType === 'event' ? (
                        <>
                          <option value="festival">Festival</option>
                          <option value="concert">Concert</option>
                          <option value="exhibition">Exhibition</option>
                          <option value="workshop">Workshop</option>
                          <option value="sports">Sports</option>
                          <option value="cultural">Cultural</option>
                        </>
                      ) : (
                        <>
                          <option value="suggestion">Suggestion</option>
                          <option value="praise">Praise</option>
                          <option value="inquiry">Question or inquiry</option>
                        </>
                      )}
                    </select>
                  </label>
                )}
                {(shareType === 'blog' || shareType === 'forum') && (
                  <label className="block text-xs font-semibold text-slate-600">
                    Topic tags
                    <input
                      value={shareType === 'blog' ? form.tags : forumForm.tags}
                      onChange={(event) => shareType === 'blog'
                        ? updateField('tags', event.target.value)
                        : setForumForm((current) => ({ ...current, tags: event.target.value }))}
                      className="content-studio-setting-input"
                      placeholder="Add tags separated by commas"
                    />
                  </label>
                )}
                <label className="block text-xs font-semibold text-slate-600">
                  Location <span className="font-normal text-slate-400">Optional</span>
                  <span className="content-studio-location-input">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <input
                      value={activeLocation}
                      onChange={(event) => shareType === 'blog'
                        ? updateField('location', event.target.value)
                        : shareType === 'forum'
                          ? setForumForm((current) => ({ ...current, location: event.target.value }))
                          : shareType === 'event'
                            ? setEventForm((current) => ({ ...current, location: event.target.value }))
                            : setFeedbackForm((current) => ({ ...current, location: event.target.value }))}
                      placeholder="Daet, Camarines Norte"
                      maxLength={160}
                    />
                  </span>
                </label>
              </div>
            </details>

            {shareType === 'blog' && (
              <details className="content-studio-section">
                <summary>Media</summary>
                <div className="space-y-3 text-xs text-slate-600">
                  <MultiMediaUpload
                    ref={galleryUploadRef}
                    value={mediaItems}
                    onChange={setMediaItems}
                    onInsert={(media) => {
                      if (!editorRef.current?.replaceImage(media)) editorRef.current?.insertImage(media)
                      setMobileSettingsOpen(false)
                    }}
                    bucket="blogs"
                    folder="blog-media"
                    maxFiles={10}
                    onUploadStateChange={setUploadingGallery}
                    onUploadProgress={setGalleryProgress}
                  />
                  {uploadingGallery && <p className="text-xs font-semibold text-blue-700" aria-live="polite">Uploading media: {galleryProgress}%</p>}
                  <label className="block font-semibold text-slate-600">
                    Gallery layout
                    <select value={mediaLayout} onChange={(event) => setMediaLayout(event.target.value)} className="content-studio-setting-input">
                      <option value="swipe">Swipe carousel</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>
                </div>
              </details>
            )}

            <details className="content-studio-section">
              <summary>Publish settings</summary>
              {shareType === 'blog' ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Visibility
                  <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="content-studio-setting-input">
                    <option value="public">Public — community</option>
                    <option value="draft">Only me — draft</option>
                  </select>
                  <span className="mt-2 block font-normal leading-5 text-slate-500">
                    {visibility === 'public' ? 'Your story will be reviewed by an administrator before it becomes public.' : 'Your story will be saved as a private draft.'}
                  </span>
                </label>
              ) : (
                <p className="text-xs leading-5 text-slate-500">Review your {shareType === 'forum' ? 'discussion' : shareType === 'event' ? 'event proposal' : 'feedback'} before sending.</p>
              )}
            </details>
          </div>

          <div className="content-studio-panel-footer">
            {autosaveWarning && <p className="mb-2 text-[11px] leading-4 text-amber-700">{autosaveWarning}</p>}
            <div className="grid gap-2">
              {shareType === 'blog' && (
                <button type="button" disabled={submitting || uploadingGallery || uploadingCover} onClick={() => handleSubmit(null, 'draft')} className="content-studio-action-secondary">
                  <FilePenLine className="h-4 w-4" />Save draft
                </button>
              )}
              <button
                type="submit"
                form="content-studio-form"
                disabled={submitting || uploadingGallery || uploadingCover || uploadingFeedbackImage}
                className="content-studio-action-primary"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )

  if (loading) {
    return (
      <main className="tourism-shell usr-section-page usr-editor usr-stories min-h-screen text-slate-900">
        <UserTopHeader />
        <div className="usr-section-container mx-auto max-w-4xl px-3 pb-24 pt-2 sm:px-4 lg:px-6">
          <SectionLoading label="Preparing the writing studio" />
        </div>
      </main>
    )
  }

  if (!session?.user) {
    return (
      <main className="tourism-shell usr-section-page usr-editor usr-stories flex min-h-screen items-center justify-center p-6 text-slate-900">
        <div className="usr-empty-state max-w-xl">
          <FilePenLine className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
          <p className="mt-4 usr-section-eyebrow">Restricted</p>
          <h1 className="mt-2 text-xl font-black text-slate-900">Log in to publish an article</h1>
          <p className="mt-2 text-sm text-slate-600">You need an active account before creating a blog post for the community.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/info/login" className="usr-section-primary">
              Log in
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="tourism-shell usr-section-page usr-editor usr-stories min-h-screen bg-slate-50 text-slate-900">
      <UserTopHeader />
      {toastMessage && (
        <div className={`content-studio-toast${toastIsError ? ' is-error' : ''}`} role={toastIsError ? 'alert' : 'status'}>
          {toastIsError ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>{toastMessage}</span>
        </div>
      )}
      <div className="content-studio-layout">
        {!previewMode && !success && (
            <div className="content-studio-action-bar">
            <div className="content-studio-tabs" role="tablist" aria-label="Content type">
              {shareOptions.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={shareType === id}
                  onClick={() => setShareType(id)}
                  className="content-studio-tab"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {id === 'blog' ? 'Story' : id === 'forum' ? 'Forum' : id === 'event' ? 'Event' : 'Feedback'}
                </button>
              ))}
            </div>
            <div className="content-studio-action-items">
              <Link href="/info/user/dashboard" className="content-studio-icon-action content-studio-mobile-back" aria-label="Back to dashboard" title="Back to dashboard">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Link>
              {shareType === 'blog' && <span className="content-studio-autosave" data-status={autosaveStatus} aria-live="polite">
                {autosaveStatus === 'saving' && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
                {autosaveStatus === 'saved' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                {autosaveStatus === 'warning' && <AlertCircle className="h-3.5 w-3.5 text-amber-600" />}
                {autosaveStatus === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-600" />}
                {autosaveStatus === 'idle' && <ShieldCheck className="h-3.5 w-3.5" />}
                {autosaveStatus === 'saving' ? 'Saving…' : autosaveStatus === 'saved' ? 'Autosaved' : autosaveStatus === 'warning' ? 'Saved with limits' : autosaveStatus === 'error' ? 'Save failed' : 'Autosave on'}
                {lastSavedAt && <span className="hidden sm:inline">{lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
              </span>}
              {shareType === 'blog' && (
                <button type="button" disabled={submitting || uploadingGallery || uploadingCover} onClick={() => handleSubmit(null, 'draft')} className="content-studio-action-secondary content-studio-action-icon-only content-studio-desktop-save" title="Save draft">
                  <FilePenLine className="h-4 w-4" /><span className="content-studio-action-label">Save draft</span>
                </button>
              )}
              <button type="button" onClick={() => setPreviewMode(true)} className="content-studio-action-secondary content-studio-action-icon-only content-studio-desktop-preview" title="Preview">
                <Eye className="h-4 w-4" /><span className="content-studio-action-label">Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileSettingsOpen(true)}
                className="content-studio-icon-action content-studio-desktop-settings"
                aria-label="Open settings"
                aria-expanded={mobileSettingsOpen}
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="content-studio-mobile-overflow" ref={mobileOverflowRef}>
                <button
                  type="button"
                  className="content-studio-icon-action content-studio-mobile-overflow-trigger"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={mobileOverflowOpen}
                  onClick={() => setMobileOverflowOpen((open) => !open)}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
                {mobileOverflowOpen && (
                  <div className="content-studio-mobile-overflow-menu" role="menu" aria-label="More editor actions">
                    {shareType === 'blog' && <button type="button" role="menuitem" disabled={submitting || uploadingGallery || uploadingCover} onClick={() => { setMobileOverflowOpen(false); handleSubmit(null, 'draft') }}><FilePenLine className="h-4 w-4" />Save draft</button>}
                    <button type="button" role="menuitem" onClick={() => { setMobileOverflowOpen(false); setPreviewMode(true) }}><Eye className="h-4 w-4" />Preview</button>
                    <button type="button" role="menuitem" onClick={() => { setMobileOverflowOpen(false); setMobileSettingsOpen(true) }}><Settings2 className="h-4 w-4" />Settings</button>
                  </div>
                )}
              </div>
              <button
                type="submit"
                form="content-studio-form"
                disabled={submitting || uploadingGallery || uploadingCover || uploadingFeedbackImage}
                className="content-studio-action-primary"
              >
                <Send className="h-4 w-4" />
                <span>{shareType === 'event' ? 'Submit event for approval' : 'Submit for approval'}</span>
              </button>
              <details className="content-studio-event-info">
                <summary className="content-studio-icon-action" aria-label="Event publishing information" title="Event publishing information">
                  <Info className="h-4 w-4" aria-hidden="true" />
                </summary>
                <div className="content-studio-event-popover">
                  Event suggestions are saved for administrator review and will not be public until approved.
                </div>
              </details>
            </div>
          </div>
        )}

        <div className="content-studio-main">
        {success ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div><p className="font-bold">{shareType === 'blog' && successStatus === 'draft' ? 'Your story was saved as a draft.' : shareType === 'blog' ? 'Your story was submitted for administrator approval.' : shareType === 'event' ? 'Your event was submitted to the administrator for approval. It will only be published after approval.' : `Your ${shareType === 'forum' ? 'discussion' : 'feedback'} was submitted.`}</p></div>
          </div>
        ) : previewMode ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              <div><p className="text-sm font-bold text-slate-900">Live preview</p><p className="text-xs text-slate-500">This is a preview of your {shareType === 'blog' ? 'story' : shareType === 'forum' ? 'discussion' : shareType === 'event' ? 'event proposal' : 'feedback'}.</p></div>
              <button type="button" onClick={() => setPreviewMode(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">Back to editor</button>
            </div>
            <article className="p-5 sm:p-8">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{shareType === 'blog' ? selectedCategory : shareType === 'forum' ? 'Forum discussion' : shareType === 'event' ? `Event · ${eventForm.category}` : `Daily feedback · ${feedbackForm.category}`}</span>
                {activeLocation && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{activeLocation}</span>
                )}
              </div>
              <h2 className="break-words text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                {shareType === 'blog' ? form.title || 'Your story title' : shareType === 'forum' ? forumForm.title || 'Your discussion title' : shareType === 'event' ? eventForm.title || 'Your event title' : 'Community feedback'}
              </h2>
              {shareType === 'blog' && form.excerpt && <p className="mt-3 text-lg leading-7 text-slate-600">{form.excerpt}</p>}
              <div className="my-5 flex items-center gap-3 border-y border-slate-100 py-4">
                {authorAvatar ? <img src={authorAvatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">{authorName[0]?.toUpperCase()}</span>}
                <div><p className="text-sm font-bold text-slate-900">{authorName}</p><p className="text-xs text-slate-500">Preview · just now</p></div>
              </div>
              {shareType === 'blog' && form.featured_image && <img src={form.featured_image} alt="Story cover preview" className="mb-6 max-h-[420px] w-full rounded-xl object-cover" />}
              {shareType === 'blog' ? (
                <div className="rich-text-preview prose max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(form.content) }} />
              ) : (
                <>
                  {shareType === 'event' && <p className="mb-3 text-sm font-semibold text-slate-500">{eventForm.start_date || 'Event date'}{eventForm.start_time ? ` · ${eventForm.start_time}` : ''}{eventForm.end_date ? ` to ${eventForm.end_date}` : ''}</p>}
                  <p className="whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{shareType === 'forum' ? forumForm.content || 'Your discussion message will appear here.' : shareType === 'event' ? eventForm.description || 'Your event description will appear here.' : feedbackForm.message || 'Your feedback will appear here.'}</p>
                </>
              )}
              {shareType === 'blog' && mediaItems.length > 0 && (
                <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mediaItems.map((media, index) => media.type === 'video'
                    ? <video key={`${media.url}-${index}`} src={media.url} controls className="max-h-56 w-full rounded-xl object-cover" />
                    : <img key={`${media.url}-${index}`} src={media.url} alt={media.name || 'Story image'} className="h-40 w-full rounded-xl object-cover" />)}
                </div>
              )}
              {shareType === 'forum' && forumMediaItems.length > 0 && <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{forumMediaItems.map((media, index) => <img key={`${media.url}-${index}`} src={media.url} alt={media.name || 'Attachment'} className="h-36 w-full rounded-xl object-cover" />)}</div>}
              {shareType === 'forum' && forumForm.tags && <div className="mt-6 flex flex-wrap gap-2">{forumForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">#{tag}</span>)}</div>}
              {shareType === 'feedback' && feedbackForm.image && <img src={feedbackForm.image} alt="Feedback attachment" className="mt-5 max-h-72 rounded-xl object-cover" />}
              {shareType === 'blog' && form.tags && <div className="mt-6 flex flex-wrap gap-2">{form.tags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">#{tag}</span>)}</div>}
            </article>
          </section>
        ) : shareType === 'blog' ? (
          <div className="content-studio-writing-column">
            <form
              id="content-studio-form"
              onSubmit={(event) => handleSubmit(event, visibility === 'public' ? 'published' : 'draft')}
              className="content-studio-story-form"
            >
              <div id="cover-media-field" className={`content-studio-cover ${form.featured_image ? 'has-cover' : ''}`}>
                <MediaUpload
                  bucket="blogs"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={form.featured_image}
                  onUploadComplete={(url) => {
                    setCoverUploadError('')
                    updateField('featured_image', url || '')
                  }}
                  onUploadStateChange={setUploadingCover}
                  onUploadError={(error) => setCoverUploadError(error)}
                  buttonText={form.featured_image ? 'Change' : 'Add a cover image'}
                  maxSizeMB={5}
                  className={`content-studio-cover-upload ${form.featured_image ? 'has-cover' : ''}`}
                  previewClassName="content-studio-cover-image"
                />
                {coverUploadError && <p className="mt-2 text-xs font-semibold text-rose-600" role="alert">{coverUploadError}</p>}
              </div>

              <input
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                className="content-studio-title"
                placeholder="Title"
                aria-label="Story title"
                autoCapitalize="words"
                maxLength={180}
              />

              <textarea
                value={form.excerpt}
                onChange={(event) => updateField('excerpt', event.target.value)}
                rows={2}
                maxLength={320}
                className="content-studio-intro"
                placeholder="Add a short summary (optional)"
                aria-label="Short story summary"
              />

              <div className="content-studio-body">
                <RichTextEditor
                  ref={editorRef}
                  initialValue={form.content}
                  contentRevision={editorContentRevision}
                  onChange={(content) => updateField('content', content)}
                  onWordCountChange={setWordCount}
                  onOpenMediaSettings={() => setMobileSettingsOpen(true)}
                  onUploadFiles={async (files) => {
                    if (galleryUploadRef.current) return galleryUploadRef.current.uploadFiles(files)
                    pendingFilesRef.current = files
                    setMobileSettingsOpen(true)
                    return []
                  }}
                  onEditorBlur={() => {
                    const payload = currentPayloadRef.current
                    if (payload?.title && plainTextFromHtml(payload.content)) {
                      void persistBlogPayload(payload, { keepalive: true }).catch((error) => {
                        console.warn('Unable to save the story on editor blur:', normalizeErrorMessage(error))
                      })
                    }
                  }}
                />
                {restoredUnsavedChanges && <p className="mt-2 text-xs font-semibold text-amber-700" role="status">Restored your saved story.</p>}
                <div className="content-studio-status-line" aria-live="polite">
                  <span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                  <span>{Math.ceil(wordCount / 200)} min read</span>
                  <span>{lastSavedAt ? `Autosaved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Autosave on'}</span>
                </div>
              </div>
            </form>
          </div>
        ) : shareType === 'event' ? (
          <section className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Event proposal</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Submit an event for review</h2>
              <p className="mt-1 text-sm text-slate-500">Your event is saved privately and will only appear publicly after an administrator approves it.</p>
              <Link href="/info/user/event-submissions" className="mt-2 inline-flex text-xs font-bold text-blue-700 hover:text-blue-900">View my event submissions</Link>
            </div>
            <form id="content-studio-form" onSubmit={handleSubmit} className="content-studio-form">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Event title</span>
                <input required maxLength={180} value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} placeholder="Name your event" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Category</span>
                  <select value={eventForm.category} onChange={(event) => setEventForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
                    <option value="festival">Festival</option><option value="concert">Concert</option><option value="exhibition">Exhibition</option><option value="workshop">Workshop</option><option value="sports">Sports</option><option value="cultural">Cultural</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Organizer <span className="font-normal normal-case text-slate-400">Optional</span></span>
                  <input maxLength={180} value={eventForm.organizer} onChange={(event) => setEventForm((current) => ({ ...current, organizer: event.target.value }))} placeholder="Organization or host" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Start date</span>
                  <input required type="date" value={eventForm.start_date} onChange={(event) => setEventForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date && current.end_date < event.target.value ? event.target.value : current.end_date }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">End date <span className="font-normal normal-case text-slate-400">Optional</span></span>
                  <input type="date" min={eventForm.start_date || undefined} value={eventForm.end_date} onChange={(event) => setEventForm((current) => ({ ...current, end_date: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Start time <span className="font-normal normal-case text-slate-400">Optional</span></span>
                  <input type="time" value={eventForm.start_time} onChange={(event) => setEventForm((current) => ({ ...current, start_time: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">End time <span className="font-normal normal-case text-slate-400">Optional</span></span>
                  <input type="time" value={eventForm.end_time} onChange={(event) => setEventForm((current) => ({ ...current, end_time: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Location <span className="font-normal normal-case text-slate-400">Optional</span></span>
                <input maxLength={240} value={eventForm.location} onChange={(event) => setEventForm((current) => ({ ...current, location: event.target.value }))} placeholder="Venue, street, or area in Daet" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={eventForm.is_free} onChange={(event) => setEventForm((current) => ({ ...current, is_free: event.target.checked, ticket_price: event.target.checked ? '' : current.ticket_price }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                This is a free event
              </label>
              {!eventForm.is_free && (
                <label className="block max-w-xs">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Ticket price</span>
                  <input required type="number" min="0" step="0.01" value={eventForm.ticket_price} onChange={(event) => setEventForm((current) => ({ ...current, ticket_price: event.target.value }))} placeholder="0.00" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                </label>
              )}
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Description</span>
                <textarea required rows={7} maxLength={10000} value={eventForm.description} onChange={(event) => setEventForm((current) => ({ ...current, description: event.target.value }))} placeholder="Share event details, schedule, and information for attendees…" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" />
              </label>
            </form>
          </section>
        ) : (
          <section className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">{shareType === 'forum' ? 'Forum discussion' : 'Daily feedback'}</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
                {shareType === 'forum' ? 'Start a community conversation' : 'Help make Daet better'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {shareType === 'forum' ? 'Ask a question or share helpful information.' : 'Send a suggestion or feedback to the Daet team.'}
              </p>
            </div>

            {shareType === 'forum' ? (
              <form id="content-studio-form" onSubmit={handleSubmit} className="content-studio-form">
                <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Discussion title</span><input value={forumForm.title} onChange={(event) => setForumForm((current) => ({ ...current, title: event.target.value }))} placeholder="What would you like to discuss?" maxLength={180} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-lg font-bold text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" /></label>
                <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Discussion message</span><textarea rows={8} value={forumForm.content} onChange={(event) => setForumForm((current) => ({ ...current, content: event.target.value }))} placeholder="Ask a question, share a tip, or start a conversation…" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" /></label>
                <div className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 text-sm font-bold text-slate-800">Photo attachments <span className="font-normal text-slate-400">Optional</span></p><MultiMediaUpload value={forumMediaItems} onChange={setForumMediaItems} bucket="blogs" folder="forum-attachments" maxFiles={6} imageOnly onUploadStateChange={setUploadingGallery} onUploadProgress={setGalleryProgress} />{uploadingGallery && <p className="mt-2 text-xs font-semibold text-blue-700">Uploading attachments: {galleryProgress}%</p>}</div>
              </form>
            ) : (
              <form id="content-studio-form" onSubmit={handleSubmit} className="content-studio-form">
                <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Your feedback</span><textarea rows={7} value={feedbackForm.message} onChange={(event) => setFeedbackForm((current) => ({ ...current, message: event.target.value }))} placeholder="Tell us what is working well or what could be improved…" className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" /></label>
                <label className="block max-w-xs"><span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Rating <span className="font-normal normal-case text-slate-400">Optional</span></span><select value={feedbackForm.rating} onChange={(event) => setFeedbackForm((current) => ({ ...current, rating: Number(event.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"><option value={5}>5 — Excellent</option><option value={4}>4 — Good</option><option value={3}>3 — Fair</option><option value={2}>2 — Needs improvement</option><option value={1}>1 — Poor</option></select></label>
                <div className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 text-sm font-bold text-slate-800">Photo attachment <span className="font-normal text-slate-400">Optional</span></p><MediaUpload bucket="blogs" folder="feedback" mediaType="image" existingMediaUrl={feedbackForm.image} onUploadComplete={(url) => setFeedbackForm((current) => ({ ...current, image: url || '' }))} onUploadStateChange={setUploadingFeedbackImage} onUploadError={(error) => alert(error)} buttonText="Upload a photo" maxSizeMB={5} /></div>
              </form>
            )}
          </section>
        )}
        </div>
        {!previewMode && !success && mobileSettingsOpen && renderSettingsPanel()}
      </div>
    </main>
  )
}
