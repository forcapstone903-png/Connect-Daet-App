'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe2, Link2, Lock, Mail, MessageCircle, Repeat2, Send, Share2, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'

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

export default function ShareRepost({ contentType, contentId, userId, onShared, onRepost, originalPost = null, fullWidth = false }) {
  const buttonRef = useRef(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showRepostComposer, setShowRepostComposer] = useState(false)
  const [showDMModal, setShowDMModal] = useState(false)
  const [quoteText, setQuoteText] = useState('')
  const [dmUsers, setDmUsers] = useState([])
  const [dmSearch, setDmSearch] = useState('')
  const [dmBody, setDmBody] = useState('')
  const [shareCount, setShareCount] = useState(0)
  const [reposted, setReposted] = useState(false)
  const [repostLoading, setRepostLoading] = useState(false)
  const [shareVisibility, setShareVisibility] = useState('public')

  const closeShareMenu = () => {
    setShowMenu(false)
    setShowRepostComposer(false)
  }

  const toggleShareMenu = () => {
    setShowMenu((current) => !current)
    if (showMenu) setShowRepostComposer(false)
  }

  useEffect(() => {
    if (!showMenu) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeShareMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [showMenu])

  const loadShareCount = useCallback(async () => {
    if (!contentType || !contentId) return

    const baseQuery = supabase
      .from('reposts')
      .select('user_id')
      .eq('original_content_type', contentType)
      .eq('original_content_id', contentId)

    let repostsResult
    try {
      repostsResult = await baseQuery.eq('status', 'active')
    } catch (error) {
      if (!isMissingRepostStatusColumnError(error)) throw error
      repostsResult = await baseQuery
    }

    const sharesResult = await supabase
      .from('content_shares')
      .select('user_id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .in('share_type', ['repost', 'quote', 'external'])

    if (repostsResult.error || sharesResult.error) return
    const users = new Set([
      ...(repostsResult.data || []).map((row) => row.user_id),
      ...(sharesResult.data || []).map((row) => row.user_id),
    ].filter(Boolean))
    setShareCount(users.size)
  }, [contentId, contentType])

  useEffect(() => {
    if (!userId || !contentType || !contentId) {
      return undefined
    }

    let active = true
    const checkExistingRepost = async () => {
      const baseQuery = supabase
        .from('reposts')
        .select('id, status')
        .eq('user_id', userId)
        .eq('original_content_type', contentType)
        .eq('original_content_id', contentId)

      try {
        const { data } = await baseQuery.maybeSingle()
        if (active) setReposted(Boolean(data?.status === 'active'))
      } catch (error) {
        if (!isMissingRepostStatusColumnError(error)) throw error
        const { data } = await supabase
          .from('reposts')
          .select('id')
          .eq('user_id', userId)
          .eq('original_content_type', contentType)
          .eq('original_content_id', contentId)
          .maybeSingle()
        if (active) setReposted(Boolean(data))
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
        const response = await fetch(`/api/reposts?contentType=${encodeURIComponent(contentType)}&contentId=${encodeURIComponent(contentId)}`, {
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

      const response = await fetch('/api/reposts', {
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

  const handleExternalShare = async (platform) => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const title = document.title || 'Check this out'

    if (platform === 'copy') {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
      alert('Link copied to clipboard!')
    } else if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, '_blank')
    } else if (platform === 'facebook') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank')
    } else if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${title} ${url}`)}`, '_blank')
    } else if (platform === 'email') {
      window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`, '_blank')
    }

    await trackShare(platform)
    setShowMenu(false)
    if (onShared) onShared(platform)
  }

  const trackShare = async (platform) => {
    try {
      const { data } = await supabase
        .from('share_analytics')
        .select('share_count')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .eq('platform', platform)
        .maybeSingle()

      const nextCount = (data?.share_count || 0) + 1

      await supabase.from('share_analytics').upsert({
        content_type: contentType,
        content_id: contentId,
        platform,
        share_count: nextCount,
        last_shared_at: new Date().toISOString(),
      }, { onConflict: 'content_type,content_id,platform' })

      if (userId) {
        await supabase.from('content_shares').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          share_type: platform === 'repost' ? 'repost' : 'external',
          platform,
        })

        trackUserActivity({
          userId,
          activityType: 'share_content',
          entityType: contentType,
          entityId: contentId,
          description: `Shared ${contentType}`,
          metadata: { contentTitle: document.title || contentType, platform },
        })
      }

      setShareCount(nextCount)
    } catch (err) {
      console.error('Share tracking failed:', err)
    }
  }

  const handleSendDM = async () => {
    if (!userId || dmUsers.length === 0) {
      alert('Select a recipient and log in to send a direct message.')
      return
    }
    try {
      await Promise.all(dmUsers.map((recipient) =>
        supabase.from('content_shares').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          share_type: 'dm',
          caption: dmBody || null,
          recipient_user_id: recipient.id,
        })
      ))
      await trackShare('dm')
      setShowDMModal(false)
      setDmUsers([])
      setDmBody('')
      setShowMenu(false)
      if (onShared) onShared('dm')
    } catch (err) {
      console.error('DM share failed:', err)
      alert('Failed to send direct message share.')
    }
  }

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setDmUsers([])
      return
    }
    const { data } = await supabase
      .from('info_users')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5)
    setDmUsers(data || [])
  }

  return (
    <div className="relative z-30 inline-flex w-full max-w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleShareMenu}
        className={`inline-flex h-9 max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 ${fullWidth ? 'w-full' : ''}`}
      >
        <Share2 className="h-3.5 w-3.5" />
        {shareCount > 0 && <span>{shareCount}</span>}
        <span className="hidden sm:inline">Share</span>
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-100"
            onClick={closeShareMenu}
            aria-hidden="true"
          />
          <div
            className="fixed inset-x-0 bottom-0 z-110 mx-auto w-full max-w-[420px] rounded-t-[28px] border border-slate-700/80 bg-[#0f1c2d] p-4 text-slate-100 shadow-[0_-18px_52px_rgba(2,6,23,0.72)] sm:bottom-6 sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-600/80" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <button type="button" onClick={closeShareMenu} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-200 transition hover:bg-slate-700" aria-label="Close share menu">
                <X className="h-4 w-4" />
              </button>
              <h3 className="flex-1 text-left text-lg font-black text-slate-50">{showRepostComposer ? 'Quote Repost' : 'Share'}</h3>
              <button type="button" onClick={closeShareMenu} className="text-sm font-semibold text-slate-300 transition hover:text-white">
                Close
              </button>
            </div>

            {!showRepostComposer ? (
              <>
                <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Privacy</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIVACY_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setShareVisibility(value)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition ${shareVisibility === value ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-slate-600 bg-slate-800/70 text-slate-300 hover:bg-slate-700/70 hover:text-white'}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
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
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <Repeat2 className={`h-4 w-4 ${reposted ? 'text-emerald-400' : 'text-slate-300'}`} /> {repostLoading ? 'Updating...' : reposted ? 'Reposted' : 'Repost'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDMModal(true); setShowMenu(false) }}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <Send className="h-4 w-4 text-sky-400" /> Share to DM
                  </button>
                  <div className="my-2 border-t border-slate-700" />
                  <button
                    type="button"
                    onClick={() => handleExternalShare('whatsapp')}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <MessageCircle className="h-4 w-4 text-emerald-400" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExternalShare('facebook')}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <span className="text-base leading-none">📘</span> Facebook
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExternalShare('twitter')}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <span className="text-base leading-none">🐦</span> Twitter / X
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExternalShare('email')}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <Mail className="h-4 w-4 text-amber-400" /> Email
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExternalShare('copy')}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left text-sm font-semibold text-slate-100 transition hover:bg-slate-800/80"
                  >
                    <Link2 className="h-4 w-4 text-slate-300" /> Copy Link
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Privacy</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIVACY_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setShareVisibility(value)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition ${shareVisibility === value ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : 'border-slate-600 bg-slate-800/70 text-slate-300 hover:bg-slate-700/70 hover:text-white'}`}
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
                  className="w-full rounded-[14px] border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-400"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRepost(quoteText.trim() || null)}
                    disabled={!userId}
                    className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {userId ? 'Repost' : 'Log in to Repost'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRepost(null)}
                    className="rounded-full border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                  >
                    Repost Only
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* DM modal */}
      {showDMModal && (
        <div className="fixed inset-0 z-[120] bg-black/50" onClick={() => setShowDMModal(false)} aria-hidden="true">
          <div
            className="fixed inset-x-0 bottom-0 z-[121] mx-auto w-full max-w-[420px] rounded-t-[28px] border border-slate-700/80 bg-[#0f1c2d] p-4 text-slate-100 shadow-[0_-18px_52px_rgba(2,6,23,0.72)] sm:bottom-6 sm:rounded-[28px]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-600/80" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <button type="button" onClick={() => setShowDMModal(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-200 transition hover:bg-slate-700" aria-label="Close DM share dialog">
                <X className="h-4 w-4" />
              </button>
              <h3 className="flex-1 text-left text-lg font-black text-slate-50">Share to DM</h3>
              <button type="button" onClick={() => setShowDMModal(false)} className="text-sm font-semibold text-slate-300 transition hover:text-white">
                Close
              </button>
            </div>

            <input
              type="text"
              value={dmSearch}
              onChange={(e) => { setDmSearch(e.target.value); searchUsers(e.target.value) }}
              placeholder="Search users to send to..."
              className="w-full rounded-[14px] border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-400"
            />

            {dmUsers.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-[14px] border border-slate-700 bg-slate-900/70">
                {dmUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setDmUsers((prev) => {
                        const exists = prev.some((u) => u.id === user.id)
                        return exists ? prev.filter((u) => u.id !== user.id) : [...prev, user]
                      })
                      setDmSearch('')
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-slate-800/80"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/15 text-xs font-bold text-sky-200">
                      {(user.full_name || 'User')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{user.full_name}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              {dmUsers.filter((u) => u && typeof u === 'object' && u.id).map((user) => (
                <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-200">
                  {user.full_name || 'User'}
                  <button type="button" onClick={() => setDmUsers((prev) => prev.filter((u) => u.id !== user.id))} className="inline-flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <textarea
              value={dmBody}
              onChange={(e) => setDmBody(e.target.value)}
              placeholder="Add a message (optional)..."
              rows={2}
              className="mt-2 w-full rounded-[14px] border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-400"
            />

            <button
              type="button"
              onClick={handleSendDM}
              disabled={!userId || dmUsers.length === 0}
              className="mt-3 w-full rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
            >
              {userId ? 'Send' : 'Log in to Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}