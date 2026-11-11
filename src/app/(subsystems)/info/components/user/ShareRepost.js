'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FilePenLine, Globe2, Lock, Repeat2, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe2 },
  { value: 'followers', label: 'Followers', icon: Users },
  { value: 'private', label: 'Only Me', icon: Lock },
]

function isMissingRepostStatusColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes("'status' column of 'reposts'") ||
    message.includes('reposts.status') ||
    (message.includes('status') && message.includes('reposts') && message.includes('schema cache'))
  )
}

export default function ShareRepost({ contentType, contentId, userId, onShared, onRepost, originalPost = null, fullWidth = false, compactFeed = false, buttonClassName = '' }) {
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const [showRepostComposer, setShowRepostComposer] = useState(false)
  const [quoteText, setQuoteText] = useState('')
  const [repostId, setRepostId] = useState(null)
  const [savedQuoteText, setSavedQuoteText] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [shareCount, setShareCount] = useState(0)
  const [reposted, setReposted] = useState(false)
  const [repostLoading, setRepostLoading] = useState(false)
  const [shareVisibility, setShareVisibility] = useState('public')

  const closeShareMenu = useCallback(() => {
    setShowMenu(false)
    setShowRepostComposer(false)
  }, [])

  const toggleShareMenu = () => {
    if (showMenu) {
      closeShareMenu()
      return
    }
    setShowRepostComposer(false)
    setShowMenu(true)
  }

  useLayoutEffect(() => {
    if (!showMenu) return undefined

    const positionMenu = () => {
      const trigger = buttonRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      if (triggerRect.bottom < 0 || triggerRect.top > window.innerHeight) {
        closeShareMenu()
        return
      }

      const viewportPadding = 12
      const gap = 8
      const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - gap
      const availableAbove = triggerRect.top - viewportPadding - gap
      const menuHeight = menu.getBoundingClientRect().height
      const useBelow = availableBelow >= menuHeight || availableBelow >= availableAbove
      const availableHeight = Math.max(180, useBelow ? availableBelow : availableAbove)
      const top = useBelow
        ? Math.min(triggerRect.bottom + gap, window.innerHeight - viewportPadding - Math.min(menuHeight, availableHeight))
        : Math.max(viewportPadding, triggerRect.top - gap - Math.min(menuHeight, availableHeight))
      const menuWidth = menu.getBoundingClientRect().width
      const left = Math.min(
        Math.max(viewportPadding, triggerRect.left),
        window.innerWidth - menuWidth - viewportPadding,
      )

      const nextPosition = { top, left, maxHeight: `min(${availableHeight}px, calc(100dvh - ${viewportPadding * 2}px))` }
      setMenuPosition((current) => (
        current?.top === nextPosition.top
          && current?.left === nextPosition.left
          && current?.maxHeight === nextPosition.maxHeight
          ? current
          : nextPosition
      ))
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [closeShareMenu, showMenu, showRepostComposer])

  useEffect(() => {
    if (!showMenu) return undefined
    const closeOnOutsideClick = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return
      closeShareMenu()
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [closeShareMenu, showMenu])

  useEffect(() => {
    if (!showMenu) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeShareMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [closeShareMenu, showMenu])

  const loadShareCount = useCallback(async () => {
    if (!contentType || !contentId) return

    const makeRepostsQuery = () => supabase
      .from('reposts')
      .select('user_id')
      .eq('original_content_type', contentType)
      .eq('original_content_id', contentId)

    try {
      let repostsResult = await makeRepostsQuery().eq('status', 'active')
      if (repostsResult.error && isMissingRepostStatusColumnError(repostsResult.error)) {
        repostsResult = await makeRepostsQuery()
      }

      if (repostsResult.error) {
        console.error('Unable to load repost count:', repostsResult.error.message)
        return
      }

      const sharesResult = await supabase
        .from('content_shares')
        .select('user_id')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .in('share_type', ['repost', 'quote', 'external'])

      if (sharesResult.error) {
        console.error('Unable to load share count:', sharesResult.error.message)
        return
      }

      const users = new Set([
        ...(repostsResult.data || []).map((row) => row.user_id),
        ...(sharesResult.data || []).map((row) => row.user_id),
      ].filter(Boolean))
      setShareCount(users.size)
    } catch (error) {
      console.error('Unable to load share count:', error)
    }
  }, [contentId, contentType])

  useEffect(() => {
    if (!userId || !contentType || !contentId) {
      return undefined
    }

    let active = true
    const checkExistingRepost = async () => {
      try {
        let result = await supabase
          .from('reposts')
          .select('id, status, quote_text')
          .eq('user_id', userId)
          .eq('original_content_type', contentType)
          .eq('original_content_id', contentId)
          .maybeSingle()

        if (result.error && isMissingRepostStatusColumnError(result.error)) {
          result = await supabase
            .from('reposts')
            .select('id, quote_text')
            .eq('user_id', userId)
            .eq('original_content_type', contentType)
            .eq('original_content_id', contentId)
            .maybeSingle()
          if (result.error) {
            console.error('Unable to check existing repost:', result.error.message)
            return
          }
          if (active) {
            setReposted(Boolean(result.data))
            setRepostId(result.data?.id || null)
            setSavedQuoteText(result.data?.quote_text || '')
          }
          return
        }

        if (result.error) {
          console.error('Unable to check existing repost:', result.error.message)
          return
        }
        if (active) {
          const isActive = Boolean(result.data && result.data.status !== 'archived')
          setReposted(isActive)
          setRepostId(isActive ? result.data.id : null)
          setSavedQuoteText(isActive ? result.data.quote_text || '' : '')
        }
      } catch (error) {
        console.error('Unable to check existing repost:', error)
      }
    }

    void checkExistingRepost()

    return () => { active = false }
  }, [contentId, contentType, userId])

  useEffect(() => {
    if (!userId) return undefined

    let active = true
    const loadCurrentUser = async () => {
      const { data, error } = await supabase
        .from('info_users')
        .select('id, full_name, profile_image_url')
        .eq('id', userId)
        .maybeSingle()
      if (error) {
        console.error('Unable to load repost composer profile:', error.message)
        return
      }
      if (active) setCurrentUser(data || null)
    }
    void loadCurrentUser()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadShareCount() }, 0)
    if (!contentType || !contentId || !supabase?.channel) return () => window.clearTimeout(timer)
    const channelSuffix = Math.random().toString(36).slice(2)
    const channel = supabase.channel(`content-shares-${contentType}-${contentId}-${channelSuffix}`)
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reposts', filter: `original_content_type=eq.${contentType}` }, (payload) => {
        const changed = payload?.new || payload?.old
        if (changed?.original_content_id === contentId) void loadShareCount()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_shares', filter: `content_type=eq.${contentType}` }, (payload) => {
        const changed = payload?.new || payload?.old
        if (changed?.content_id === contentId) void loadShareCount()
      })
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [contentId, contentType, loadShareCount])

  const publishRepostChange = (detail) => {
    onRepost?.(detail)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('daet-repost-created', { detail }))
  }

  const handleRepost = async (quote = null) => {
    if (!userId) {
      alert('Please log in to repost.')
      return
    }
    if (repostLoading) return
    setRepostLoading(true)
    try {
      if (reposted) {
        const response = await fetch(`/info/api/reposts?contentType=${encodeURIComponent(contentType)}&contentId=${encodeURIComponent(contentId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to undo this repost.')
        setReposted(false)
        setRepostId(null)
        setSavedQuoteText('')
        void loadShareCount()
        publishRepostChange({ action: 'removed', contentType, contentId, userId })
        setShowMenu(false)
        return
      }

      const response = await fetch('/info/api/reposts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ contentType, contentId, quoteText: quote, visibility: shareVisibility }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to repost this content.')
      }

      setReposted(true)
      setRepostId(result.repost?.id || null)
      setSavedQuoteText(result.repost?.quote_text || quote || '')
      void loadShareCount()
      setShowRepostComposer(false)
      setQuoteText('')
      setShowMenu(false)
      if (!result.alreadyReposted) {
        publishRepostChange({ action: 'created', repost: result.repost, reposter: result.reposter || null, original: result.original || originalPost, contentType, contentId, userId })
      }
      if (onShared) onShared('repost')
      window.dispatchEvent(new CustomEvent('daet-alert-toast', { detail: { message: 'Story reposted' } }))
    } catch (err) {
      console.error('Repost failed:', err?.message || err)
      alert(err?.message || 'Failed to repost. Please try again.')
    } finally {
      setRepostLoading(false)
    }
  }

  const saveRepostNote = async () => {
    if (!userId) {
      alert('Please log in to repost.')
      return
    }
    if (repostLoading) return
    setRepostLoading(true)
    try {
      let response
      if (reposted && repostId) {
        response = await fetch(`/info/api/reposts/${encodeURIComponent(repostId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteText: quoteText.trim() || null }),
        })
      } else {
        response = await fetch('/info/api/reposts', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType, contentId, quoteText: quoteText.trim() || null, visibility: shareVisibility }),
        })
      }

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save your repost note.')

      const nextRepost = result.repost
      setReposted(true)
      setRepostId(nextRepost?.id || repostId)
      setSavedQuoteText(nextRepost?.quote_text || quoteText.trim())
      setShowRepostComposer(false)
      setShowMenu(false)
      setQuoteText('')
      void loadShareCount()
      if (!repostId && nextRepost?.id) {
        publishRepostChange({
          action: 'created',
          repost: nextRepost,
          reposter: result.reposter || composerUser,
          original: result.original || originalPost,
          contentType,
          contentId,
          userId,
        })
      } else if (nextRepost?.id) {
        publishRepostChange({
          action: 'updated',
          repost: nextRepost,
          contentType,
          contentId,
          userId,
        })
      }
      if (!repostId && onShared) onShared('repost')
      if (!repostId) window.dispatchEvent(new CustomEvent('daet-alert-toast', { detail: { message: 'Story reposted' } }))
    } catch (error) {
      console.error('Repost note save failed:', error)
      alert(error?.message || 'Unable to save your repost note.')
    } finally {
      setRepostLoading(false)
    }
  }

  const rawOriginalImage = originalPost?.featured_image || originalPost?.image_url || originalPost?.images?.[0]
  const originalImage = typeof rawOriginalImage === 'string'
    ? rawOriginalImage
    : rawOriginalImage?.url || rawOriginalImage?.src || ''
  const composerUser = currentUser?.id === userId ? currentUser : null

  return (
    <div className={`share-repost-wrapper relative z-30 inline-flex max-w-full ${fullWidth ? 'w-full' : 'w-auto'}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleShareMenu}
        aria-haspopup="dialog"
        aria-expanded={showMenu}
        aria-label={`${reposted ? 'Repost options' : 'Repost'}, ${shareCount} shares`}
        className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 ${fullWidth ? 'w-full' : ''} ${compactFeed ? 'medium-home-share-button' : ''} ${buttonClassName}`}
      >
        <Repeat2 className={compactFeed ? 'h-[20px] w-[20px]' : 'h-4 w-4'} />
        {shareCount > 0 && <span>{shareCount}</span>}
        {!compactFeed && <span className="hidden sm:inline">Repost</span>}
      </button>

      {showMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Repost options"
          className="share-repost-popover fixed z-[110] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-2xl border p-3.5"
          style={{
            top: menuPosition?.top ?? 12,
            left: menuPosition?.left ?? 12,
            maxHeight: menuPosition?.maxHeight ?? 'min(70dvh, 560px)',
            visibility: menuPosition ? 'visible' : 'hidden',
          }}
          onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => void handleRepost()}
                disabled={repostLoading}
                className="share-repost-action flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition"
              >
                <Repeat2 className={`h-4 w-4 ${reposted ? 'text-emerald-500' : 'text-slate-500'}`} />
                {repostLoading ? 'Updating...' : reposted ? 'Undo repost' : 'Repost'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuoteText(reposted ? savedQuoteText : '')
                  setShowRepostComposer(true)
                  setShowMenu(false)
                }}
                className="share-repost-action flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition"
              >
                <FilePenLine className="h-4 w-4 text-slate-500" />
                {reposted ? 'Add a note' : 'Repost with a note'}
              </button>
            </div>
          </div>,
        document.body,
      )}

      {showRepostComposer && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !repostLoading) setShowRepostComposer(false) }}>
          <section className="share-repost-composer max-h-[calc(100dvh-1.5rem)] w-full max-w-[760px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="share-repost-composer-title">
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {composerUser?.profile_image_url ? <img src={composerUser.profile_image_url} alt="" className="h-full w-full object-cover" /> : (composerUser?.full_name || 'You').slice(0, 1).toUpperCase()}
                </span>
                <strong id="share-repost-composer-title" className="truncate text-base font-bold text-slate-900">{composerUser?.full_name || 'You'}</strong>
              </div>
              <button type="button" onClick={() => setShowRepostComposer(false)} disabled={repostLoading} aria-label="Close repost composer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={quoteText}
              onChange={(event) => setQuoteText(event.target.value.slice(0, 280))}
              placeholder="Add a note..."
              maxLength={280}
              rows={3}
              aria-label="Add a note to your repost"
              className="share-repost-textarea mx-5 mt-3 block min-h-24 w-[calc(100%-2.5rem)] resize-y rounded-lg border px-3 py-2.5 text-sm outline-none"
            />

            <div className="mx-5 mt-3 flex items-center justify-between gap-3">
              <label className="share-repost-muted text-xs font-semibold" htmlFor="repost-audience">Audience</label>
              <select id="repost-audience" value={shareVisibility} onChange={(event) => setShareVisibility(event.target.value)} disabled={reposted} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60">
                {PRIVACY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>

            {originalPost && (
              <article className="share-repost-preview mx-5 mt-3 flex min-w-0 overflow-hidden rounded-lg border border-slate-200">
                {originalImage && <img src={originalImage} alt="" className="h-28 w-32 shrink-0 object-cover sm:w-44" />}
                <div className="min-w-0 p-3">
                  <p className="line-clamp-2 text-sm font-bold text-slate-900">{originalPost.title || originalPost.name || 'Shared content'}</p>
                  {(originalPost.excerpt || originalPost.description || originalPost.content) && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{originalPost.excerpt || originalPost.description || originalPost.content}</p>}
                  <p className="mt-2 truncate text-[11px] text-slate-500">{originalPost.author?.full_name || 'Community'}</p>
                </div>
              </article>
            )}

            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="text-xs font-medium text-slate-500">{quoteText.length}/280</span>
              <button type="button" onClick={() => void saveRepostNote()} disabled={repostLoading || (!reposted && !userId)} className="rounded-full bg-sky-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {repostLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}

    </div>
  )
}