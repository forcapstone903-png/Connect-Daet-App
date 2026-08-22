'use client'

import { useState } from 'react'
import { Link2, Mail, MessageCircle, Repeat2, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function ShareRepost({ contentType, contentId, userId, onShared }) {
  const [showMenu, setShowMenu] = useState(false)
  const [showRepostModal, setShowRepostModal] = useState(false)
  const [showDMModal, setShowDMModal] = useState(false)
  const [quoteText, setQuoteText] = useState('')
  const [dmUsers, setDmUsers] = useState([])
  const [dmSearch, setDmSearch] = useState('')
  const [dmBody, setDmBody] = useState('')
  const [shareCount, setShareCount] = useState(0)

  const handleRepost = async () => {
    if (!userId) {
      alert('Please log in to repost.')
      return
    }
    try {
      const { error } = await supabase.from('reposts').upsert({
        user_id: userId,
        original_content_type: contentType,
        original_content_id: contentId,
        quote_text: quoteText || null,
      }, { onConflict: 'user_id,original_content_type,original_content_id' })

      if (error) throw error

      await trackShare('repost')
      setShowRepostModal(false)
      setQuoteText('')
      setShowMenu(false)
      if (onShared) onShared('repost')
    } catch (err) {
      console.error('Repost failed:', err)
      alert('Failed to repost. Please try again.')
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
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`
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
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        <Repeat2 className="h-3.5 w-3.5" />
        {shareCount > 0 && <span>{shareCount}</span>}
        <span className="hidden sm:inline">Share</span>
      </button>

      {showMenu && (
        <>
          <div className="absolute bottom-full left-0 z-20 mb-2 w-56 overflow-hidden rounded-[16px] border border-slate-200 bg-white p-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => { setShowRepostModal(true); setShowMenu(false) }}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Repeat2 className="h-4 w-4 text-emerald-600" /> Repost
            </button>
            <button
              type="button"
              onClick={() => { setShowDMModal(true); setShowMenu(false) }}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Send className="h-4 w-4 text-sky-600" /> Share to DM
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={() => handleExternalShare('whatsapp')}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <MessageCircle className="h-4 w-4 text-emerald-500" /> WhatsApp
            </button>
            <button
              type="button"
              onClick={() => handleExternalShare('facebook')}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="text-base leading-none">📘</span> Facebook
            </button>
            <button
              type="button"
              onClick={() => handleExternalShare('twitter')}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="text-base leading-none">🐦</span> Twitter / X
            </button>
            <button
              type="button"
              onClick={() => handleExternalShare('email')}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4 text-amber-600" /> Email
            </button>
            <button
              type="button"
              onClick={() => handleExternalShare('copy')}
              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Link2 className="h-4 w-4 text-slate-500" /> Copy Link
            </button>
          </div>

          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
        </>
      )}

      {/* Repost modal */}
      {showRepostModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[24px] bg-white p-5 shadow-xl sm:rounded-[24px]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Quote Repost</h3>
              <button type="button" onClick={() => setShowRepostModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={quoteText}
              onChange={(e) => setQuoteText(e.target.value)}
              placeholder="Add a comment to your repost..."
              rows={3}
              className="w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-300"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleRepost()}
                disabled={!userId}
                className="flex-1 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {userId ? 'Repost' : 'Log in to Repost'}
              </button>
              <button
                type="button"
                onClick={() => { setShowRepostModal(false); handleRepost() }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Repost Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM modal */}
      {showDMModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[24px] bg-white p-5 shadow-xl sm:rounded-[24px]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Share to DM</h3>
              <button type="button" onClick={() => setShowDMModal(false)} className="rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              type="text"
              value={dmSearch}
              onChange={(e) => { setDmSearch(e.target.value); searchUsers(e.target.value) }}
              placeholder="Search users to send to..."
              className="w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-sky-300"
            />

            {dmUsers.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-[14px] border border-slate-200 bg-white">
                {dmUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      // Toggle selection
                      setDmUsers((prev) => {
                        const exists = prev.some((u) => u.id === user.id)
                        return exists ? prev.filter((u) => u.id !== user.id) : [...prev, user]
                      })
                      setDmSearch('')
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                      {(user.full_name || 'User')[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-1">
              {dmUsers.filter((u) => u && typeof u === 'object' && u.id).map((user) => (
                <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                  {user.full_name || 'User'}
                  <button type="button" onClick={() => setDmUsers((prev) => prev.filter((u) => u.id !== user.id))}>
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
              className="mt-2 w-full rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-sky-300"
            />

            <button
              type="button"
              onClick={handleSendDM}
              disabled={!userId || dmUsers.length === 0}
              className="mt-3 w-full rounded-full bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {userId ? 'Send' : 'Log in to Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}