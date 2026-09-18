'use client'

import { useEffect, useRef, useState } from 'react'
import { Archive, Globe2, Lock, MoreHorizontal, Pencil, Trash2, Users, X } from 'lucide-react'

const PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe2 },
  { value: 'followers', label: 'Followers', icon: Users },
  { value: 'private', label: 'Only Me', icon: Lock },
]

const privacyLabel = (value) => PRIVACY_OPTIONS.find((option) => option.value === value)?.label || 'Public'

export default function PostActionMenu({ isRepost = false, visibility = 'public', onEdit, onPrivacyChange, onArchive, onDelete, onRestore, onHide, onNotInterested, onCopyLink }) {
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState('')
  const [currentVisibility, setCurrentVisibility] = useState(visibility || 'public')

  useEffect(() => {
    if (!open) return undefined
    const updatePosition = () => {
      const button = buttonRef.current?.getBoundingClientRect()
      if (!button) return
      const menuHeight = 280
      const gap = 8
      const width = 192
      const openUp = button.top >= menuHeight + gap
      const top = Math.min(Math.max(8, openUp ? button.top - menuHeight - gap : button.bottom + gap), window.innerHeight - menuHeight - 8)
      const left = Math.min(Math.max(8, button.right - width), window.innerWidth - width - 8)
      setMenuPosition({ top, left, openUp })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

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
    <>
      {onPrivacyChange && <span className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400" title={`Visible to ${privacyLabel(currentVisibility)}`} aria-label={`Visible to ${privacyLabel(currentVisibility)}`}><PrivacyIcon className="h-3.5 w-3.5" /></span>}
      <button ref={buttonRef} type="button" aria-label="Post options" aria-expanded={open} title="Post options" onClick={toggleMenu} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && menuPosition && (
        <div ref={menuRef} className="fixed z-80 max-h-[calc(100vh-16px)] w-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={{ top: menuPosition.top, left: menuPosition.left }} role="menu">
          {onEdit && <button type="button" onClick={() => chooseAction(onEdit)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" role="menuitem"><Pencil className="h-4 w-4 text-sky-600" />Edit</button>}
          {onPrivacyChange && <button type="button" onClick={() => { setOpen(false); setPrivacyOpen(true) }} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" role="menuitem"><PrivacyIcon className="h-4 w-4 text-slate-600" />Edit Privacy</button>}
          {onRestore && <button type="button" onClick={() => chooseAction(onRestore)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50" role="menuitem"><Archive className="h-4 w-4" />Restore</button>}
          {onArchive && <button type="button" onClick={() => chooseAction(onArchive)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50" role="menuitem"><Archive className="h-4 w-4" />Archive</button>}
          {onDelete && <button type="button" onClick={() => chooseAction(onDelete)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50" role="menuitem"><Trash2 className="h-4 w-4" />{isRepost ? 'Delete Repost' : 'Delete'}</button>}
          {onHide && <button type="button" onClick={() => chooseAction(onHide)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" role="menuitem"><Archive className="h-4 w-4" />Hide post</button>}
          {onNotInterested && <button type="button" onClick={() => chooseAction(onNotInterested)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" role="menuitem"><X className="h-4 w-4" />Not interested</button>}
          {onCopyLink && <button type="button" onClick={() => chooseAction(onCopyLink)} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-600 hover:bg-slate-50" role="menuitem"><Globe2 className="h-4 w-4" />Copy link</button>}
        </div>
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
    </>
  )
}
