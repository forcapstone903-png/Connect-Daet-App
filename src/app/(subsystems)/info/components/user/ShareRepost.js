'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe2, Lock, Repeat2, Users, X } from 'lucide-react'
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

export default function ShareRepost({ contentType, contentId, userId, onShared, onRepost, originalPost = null, fullWidth = false, compactFeed = false }) {
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const [showRepostComposer, setShowRepostComposer] = useState(false)
  const [quoteText, setQuoteText] = useState('')
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
          .select('id, status')
          .eq('user_id', userId)
          .eq('original_content_type', contentType)
          .eq('original_content_id', contentId)
          .maybeSingle()

        if (result.error && isMissingRepostStatusColumnError(result.error)) {
          result = await supabase
            .from('reposts')
            .select('id')
            .eq('user_id', userId)
            .eq('original_content_type', contentType)
            .eq('original_content_id', contentId)
            .maybeSingle()
          if (result.error) {
            console.error('Unable to check existing repost:', result.error.message)
            return
          }
          if (active) setReposted(Boolean(result.data))
          return
        }

        if (result.error) {
          console.error('Unable to check existing repost:', result.error.message)
          return
        }
        if (active) setReposted(Boolean(result.data?.status === 'active'))
      } catch (error) {
        console.error('Unable to check existing repost:', error)
      }
    }

    void checkExistingRepost()

    return () => { active = false }
  }, [contentId, contentType, userId])

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
      void loadShareCount()
      setShowRepostComposer(false)
      setQuoteText('')
      setShowMenu(false)
      if (!result.alreadyReposted) {
        publishRepostChange({ action: 'created', repost: result.repost, reposter: result.reposter || null, original: result.original || originalPost, contentType, contentId, userId })
      }
      if (onShared) onShared('repost')
    } catch (err) {
      console.error('Repost failed:', err?.message || err)
      alert(err?.message || 'Failed to repost. Please try again.')
    } finally {
      setRepostLoading(false)
    }
  }

  return (
    <div className="relative z-30 inline-flex w-full max-w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleShareMenu}
        aria-haspopup="dialog"
        aria-expanded={showMenu}
        className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 ${fullWidth ? 'w-full' : ''} ${compactFeed ? 'medium-home-share-button' : ''}`}
      >
        <Repeat2 className="h-4 w-4" />
        {shareCount > 0 && <span>{shareCount}</span>}
        {!compactFeed && <span className="hidden sm:inline">Repost</span>}
      </button>

      {showMenu && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label={showRepostComposer ? 'Quote repost settings' : 'Repost options'}
          className="share-repost-popover fixed z-[110] w-[min(300px,calc(100vw-24px))] overflow-y-auto rounded-2xl border p-3.5"
          style={{
            top: menuPosition?.top ?? 12,
            left: menuPosition?.left ?? 12,
            maxHeight: menuPosition?.maxHeight ?? 'min(70dvh, 560px)',
            visibility: menuPosition ? 'visible' : 'hidden',
          }}
          onClick={(event) => event.stopPropagation()}
        >
            <div className="mb-3 flex items-center justify-between gap-3">
              <button type="button" onClick={closeShareMenu} className="share-repost-close inline-flex h-8 w-8 items-center justify-center rounded-full transition" aria-label="Close share menu">
                <X className="h-4 w-4" />
              </button>
              <h3 className="share-repost-title flex-1 text-left text-base font-bold">{showRepostComposer ? 'Quote Repost' : 'Repost'}</h3>
              <button type="button" onClick={closeShareMenu} className="share-repost-close-label text-sm font-semibold transition">
                Close
              </button>
            </div>

            {!showRepostComposer ? (
              <button
                type="button"
                onClick={() => {
                  if (reposted) {
                    void handleRepost()
                  } else {
                    setShowRepostComposer(true)
                  }
                }}
                disabled={repostLoading}
                className="share-repost-action flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition"
              >
                <Repeat2 className={`h-4 w-4 ${reposted ? 'text-emerald-500' : 'text-slate-500'}`} /> {repostLoading ? 'Updating...' : reposted ? 'Reposted' : 'Repost'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="share-repost-privacy rounded-xl border p-2.5">
                  <p className="share-repost-muted mb-2 text-[10px] font-bold uppercase tracking-[0.12em]">Privacy</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIVACY_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setShareVisibility(value)}
                        className={`share-repost-privacy-option flex min-h-9 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-semibold transition ${shareVisibility === value ? 'is-selected' : ''}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={quoteText}
                  onChange={(e) => setQuoteText(e.target.value)}
                  placeholder="Add a comment to your repost..."
                  rows={3}
                  className="share-repost-textarea w-full rounded-xl border px-3 py-2 text-sm outline-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRepost(quoteText.trim() || null)}
                    disabled={!userId}
                    className="share-repost-primary rounded-full px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    {userId ? 'Repost' : 'Log in to Repost'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepost(null)}
                    className="share-repost-secondary rounded-full border px-4 py-2.5 text-sm font-semibold"
                  >
                    Repost Only
                  </button>
                </div>
              </div>
            )}
          </div>,
        document.body,
      )}

    </div>
  )
}