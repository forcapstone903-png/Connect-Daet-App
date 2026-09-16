'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Archive, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react'
import SocialActionBar from '@/app/components/user/SocialActionBar'

function getInitials(name = '') {
  return String(name).split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function formatRelativeTime(value) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export default function QuoteRepostCard({ item, reposter, reposterName, userId, commentCount = 0, isSaved = false, onToggleComments, onToggleSave, onDelete, onArchive, onRestore }) {
  const original = item.original_post || {}
  const originalAuthor = original.author || item.original_author || {}
  const originalAuthorName = originalAuthor.full_name || 'Community member'
  const reposterId = reposter?.id || item.reposted_by || item.created_by
  const reposterDisplayName = reposterName || reposter?.full_name || 'Community member'
  const originalHref = item.href || '#'
  const contentType = item.original_content_type || (item.type === 'blog' ? 'blog' : 'user_post')
  const originalId = item.original_content_id || original.id
  const images = Array.isArray(original.images) ? original.images : []
  const videos = Array.isArray(original.videos) ? original.videos : []
  const imageItems = images.length ? images : (original.featured_image ? [original.featured_image] : [])
  const originalText = String(original.excerpt || original.description || original.content || '').trim()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2 text-[11px] text-slate-600">
        <Link href={reposterId ? `/user/profile/${reposterId}` : '#'} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700" aria-label={`View ${reposterDisplayName}'s profile`}>
          {reposter?.profile_image_url ? <img src={reposter.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(reposterDisplayName)}
        </Link>
        <Link href={reposterId ? `/user/profile/${reposterId}` : '#'} className="font-bold text-slate-900 hover:text-sky-700">{reposterDisplayName}</Link>
        <span aria-hidden="true" className="text-emerald-600">🔄</span>
        <span>reposted</span>
        <span className="text-slate-400">·</span>
        <time dateTime={item.created_at || undefined}>{formatRelativeTime(item.created_at)}</time>
        {reposterId === userId && (onDelete || onArchive || onRestore) && <div className="relative ml-auto">
          <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Open repost actions" aria-expanded={menuOpen} title="Repost actions" className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal className="h-4 w-4" /></button>
          {menuOpen && <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {onRestore && <button type="button" onClick={() => { setMenuOpen(false); onRestore() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><RotateCcw className="h-4 w-4" />Restore repost</button>}
            {onArchive && <button type="button" onClick={() => { if (window.confirm('Archive repost?\n\nThis will hide the repost from your profile and feed. You can restore it from Archive.') ) { setMenuOpen(false); onArchive() } }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50"><Archive className="h-4 w-4" />Archive repost</button>}
            {onDelete && <button type="button" onClick={() => { if (window.confirm('Delete repost?\n\nThis will permanently remove your repost.')) { setMenuOpen(false); onDelete() } }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete repost</button>}
          </div>}
        </div>}
      </div>

      {item.repost_quote && <p className="mt-2 break-words text-[15px] leading-6 text-slate-900">{item.repost_quote}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Link href={originalAuthor.id ? `/user/profile/${originalAuthor.id}` : originalHref} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-black text-sky-700">
              {originalAuthor.profile_image_url ? <img src={originalAuthor.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(originalAuthorName)}
            </Link>
            <Link href={originalAuthor.id ? `/user/profile/${originalAuthor.id}` : originalHref} className="min-w-0 truncate text-sm font-bold text-slate-900 hover:text-sky-700">{originalAuthorName}</Link>
            <span className="text-slate-400">·</span>
            <time className="text-xs text-slate-500" dateTime={original.created_at || undefined}>{formatRelativeTime(original.created_at)}</time>
          </div>

          {original.title && <Link href={originalHref} className="mt-3 block text-base font-extrabold leading-6 text-slate-950 hover:text-sky-700">{original.title}</Link>}
          {originalText && <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-slate-700">{originalText}</p>}

          {(imageItems.length > 0 || videos.length > 0 || original.video_url) && (
            <div className="mt-4 grid gap-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:grid-cols-2">
              {imageItems.map((url, index) => <Link key={`${url}-${index}`} href={originalHref} className="block"><img src={url} alt={`${original.title || 'Original post'} ${index + 1}`} className="aspect-[16/9] w-full object-cover" /></Link>)}
              {(videos.length ? videos : (original.video_url ? [original.video_url] : [])).map((url, index) => <video key={`${url}-${index}`} src={url} controls className="aspect-[16/9] w-full object-cover" preload="metadata" />)}
            </div>
          )}

          {originalId && <div className="mt-3"><SocialActionBar contentType={contentType} contentId={originalId} userId={userId} originalPost={{ ...original, id: originalId, author: originalAuthor }} commentCount={commentCount} onToggleComments={onToggleComments} isSaved={isSaved} onToggleSave={onToggleSave} /></div>}
        </div>
      </div>
    </>
  )
}
