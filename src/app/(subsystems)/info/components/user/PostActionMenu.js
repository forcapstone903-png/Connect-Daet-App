'use client'

import { useEffect, useRef, useState } from 'react'
import { Archive, Bookmark, Globe2, Link2, Lock, MoreHorizontal, Pencil, Send, Trash2, Users, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackUserActivity } from '@/lib/trackActivity'
import ShareToDMDialog from './ShareToDMDialog'

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe2 },
  { value: 'followers', label: 'Followers', icon: Users },
  { value: 'private', label: 'Only Me', icon: Lock },
]

const privacyLabel = (value) => PRIVACY_OPTIONS.find((option) => option.value === value)?.label || 'Public'

export default function PostActionMenu({ isRepost = false, visibility = 'public', contentType, contentId, userId, contentTitle, shareUrl, onEdit, onPrivacyChange, onArchive, onDelete, onRestore, onHide, onNotInterested, onCopyLink, isSaved = false, onToggleSave }) {
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState('')
  const [currentVisibility, setCurrentVisibility] = useState(visibility || 'public')
  const [shareDMOpen, setShareDMOpen] = useState(false)

  useEffect(() => {
    if (!open && !privacyOpen) return undefined
    const handleOutside = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
      setPrivacyOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        setPrivacyOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, privacyOpen])

  const toggleMenu = () => setOpen((value) => !value)
  const chooseAction = (action) => {
    setOpen(false)
    action?.()
  }

  const getContentUrl = () => {
    if (typeof window === 'undefined') return ''
    return new URL(shareUrl || window.location.href, window.location.origin).toString()
  }

  const trackExternalShare = async (platform) => {
    if (!contentType || !contentId) return

    try {
      const { data, error: selectError } = await supabase
        .from('share_analytics')
        .select('share_count')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .eq('platform', platform)
        .maybeSingle()
      if (selectError) throw selectError

      const { error: upsertError } = await supabase.from('share_analytics').upsert({
        content_type: contentType,
        content_id: contentId,
        platform,
        share_count: (data?.share_count || 0) + 1,
        last_shared_at: new Date().toISOString(),
      }, { onConflict: 'content_type,content_id,platform' })
      if (upsertError) throw upsertError

      if (userId) {
        const { error: insertError } = await supabase.from('content_shares').insert({
          user_id: userId,
          content_type: contentType,
          content_id: contentId,
          share_type: 'external',
          platform,
        })
        if (insertError) throw insertError

        trackUserActivity({
          userId,
          activityType: 'share_content',
          entityType: contentType,
          entityId: contentId,
          description: `Shared ${contentType}`,
          metadata: { contentTitle: contentTitle || contentType, platform },
        })
      }
    } catch (error) {
      console.error('Content share tracking failed:', error)
    }
  }

  const shareOnFacebook = () => {
    const url = getContentUrl()
    if (!url) return
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer')
    setOpen(false)
    void trackExternalShare('facebook')
  }

  const savePrivacy = async (nextVisibility) => {
    if (nextVisibility === currentVisibility || savingPrivacy) {
      setPrivacyOpen(false)
      return
    }
    setSavingPrivacy(true)
    setPrivacyError('')
    try {
      await onPrivacyChange?.(nextVisibility)
      setCurrentVisibility(nextVisibility)
      setPrivacyOpen(false)
      setOpen(false)
    } catch (error) {
      setPrivacyError(error?.message || 'Unable to update privacy.')
    } finally {
      setSavingPrivacy(false)
    }
  }

  const PrivacyIcon = PRIVACY_OPTIONS.find((option) => option.value === currentVisibility)?.icon || Globe2

  return (
    <div className="relative inline-flex items-center z-30">
      {onPrivacyChange && <span className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400" title={`Visible to ${privacyLabel(currentVisibility)}`} aria-label={`Visible to ${privacyLabel(currentVisibility)}`}><PrivacyIcon className="h-3.5 w-3.5" /></span>}
      <button ref={buttonRef} type="button" aria-label="Post options" aria-expanded={open} title="Post options" onClick={toggleMenu} className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div ref={menuRef} className="absolute right-0 top-full z-[120] mt-2 max-h-[calc(100vh-16px)] w-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_42px_rgba(15,23,42,0.18)]" role="menu">
          {onEdit && <button type="button" onClick={() => chooseAction(onEdit)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Pencil className="h-4 w-4 text-sky-600" />Edit</button>}
          {onPrivacyChange && <button type="button" onClick={() => { setOpen(false); setPrivacyOpen(true) }} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><PrivacyIcon className="h-4 w-4 text-slate-600" />Edit Privacy</button>}
          {onRestore && <button type="button" onClick={() => chooseAction(onRestore)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50" role="menuitem"><Archive className="h-4 w-4" />Restore</button>}
          {onArchive && <button type="button" onClick={() => chooseAction(onArchive)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50" role="menuitem"><Archive className="h-4 w-4" />Archive</button>}
          {onDelete && <button type="button" onClick={() => chooseAction(onDelete)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50" role="menuitem"><Trash2 className="h-4 w-4" />{isRepost ? 'Delete Repost' : 'Delete'}</button>}
          {onHide && <button type="button" onClick={() => chooseAction(onHide)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Archive className="h-4 w-4" />Hide post</button>}
          {onNotInterested && <button type="button" onClick={() => chooseAction(onNotInterested)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><X className="h-4 w-4" />Not interested</button>}
          {onToggleSave && <button type="button" onClick={() => chooseAction(onToggleSave)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />{isSaved ? 'Remove from saved' : 'Save post'}</button>}
          {contentType && contentId && <button type="button" onClick={() => { setOpen(false); setShareDMOpen(true) }} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Send className="h-4 w-4 text-blue-600" />Share to DM</button>}
          {contentType && contentId && <button type="button" onClick={shareOnFacebook} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Globe2 className="h-4 w-4 text-blue-600" />Share on Facebook</button>}
          {onCopyLink && <button type="button" onClick={() => chooseAction(onCopyLink)} className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" role="menuitem"><Link2 className="h-4 w-4" />Copy link</button>}
        </div>
      )}

      {shareDMOpen && contentType && contentId && (
        <ShareToDMDialog
          contentType={contentType}
          contentId={contentId}
          userId={userId}
          onClose={() => setShareDMOpen(false)}
          onShared={() => void trackExternalShare('dm')}
        />
      )}

      {privacyOpen && (
        <div ref={menuRef} className="fixed inset-0 z-90 flex items-center justify-center bg-slate-950/30 px-4" role="dialog" aria-modal="true" aria-labelledby="post-privacy-title">
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div><h2 id="post-privacy-title" className="text-sm font-bold text-slate-900">Edit Privacy</h2><p className="mt-1 text-[11px] text-slate-500">Who can see this {isRepost ? 'repost' : 'post'}?</p></div>
              <button type="button" onClick={() => setPrivacyOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-label="Close privacy selector"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-1">
              {PRIVACY_OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button" onClick={() => void savePrivacy(value)} disabled={savingPrivacy} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 ${currentVisibility === value ? 'bg-sky-50 text-sky-800' : 'text-slate-700'}`}><Icon className="h-4 w-4" /> <span className="flex-1">{label}</span>{currentVisibility === value && <span className="text-xs text-sky-600">Current</span>}</button>)}
            </div>
            {privacyError && <p className="mt-2 text-xs font-semibold text-red-600">{privacyError}</p>}
            <p className="mt-3 text-[10px] text-slate-400">Current: {privacyLabel(currentVisibility)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
