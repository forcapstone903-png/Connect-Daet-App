'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import SocialActionBar from '@/app/(subsystems)/info/components/user/SocialActionBar'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import PostActionMenu from '@/app/(subsystems)/info/components/user/PostActionMenu'
import { getRepostTarget } from '@/lib/repostIdentity'

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

export default function QuoteRepostCard({ item, reposter, reposterName, userId, commentCount = 0, isSaved = false, onToggleComments, onToggleSave, onEdit, onPrivacyChange, onDelete, onArchive, onRestore, onHide, onNotInterested, onCopyLink }) {
  const original = item.original_post || {}
  const originalAuthor = original.author || item.original_author || {}
  const originalAuthorName = originalAuthor.full_name || 'Community member'
  const reposterId = reposter?.id || item.reposted_by || item.created_by
  const reposterDisplayName = reposterName || reposter?.full_name || 'Community member'
  const originalHref = item.href || '#'
  const originalId = item.original_content_id || item.original_post_id || original.id
  const originalType = item.original_content_type || (item.type === 'blog' ? 'blog' : 'user_post')
  // All engagement (reactions, comments, share counts) keys on the ORIGINAL
  // content: info_comments rows are foreign-keyed to the original content
  // tables, so a repost row id can never be a comment target, and per-repost
  // counts would fragment from the original post's counts.
  const repostTarget = getRepostTarget(item)
  const images = Array.isArray(original.images) ? original.images : []
  const videos = Array.isArray(original.videos) ? original.videos : []
  const imageItems = images.length ? images : (original.featured_image ? [original.featured_image] : [])
  const mediaItems = [
    ...imageItems.map((url) => ({ type: 'image', url, label: `${original.title || 'Original post'} image` })),
    ...((videos.length ? videos : (original.video_url ? [original.video_url] : [])).map((url) => ({ type: 'video', url, label: `${original.title || 'Original post'} video` }))),
  ]
  const previewMedia = mediaItems.slice(0, 4)
  const hiddenMediaCount = Math.max(0, mediaItems.length - previewMedia.length)
  const previewGrid = previewMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
  const previewTileAspect = previewMedia.length === 1 ? 'aspect-[16/10]' : previewMedia.length === 2 ? 'aspect-[4/3]' : previewMedia.length === 3 ? 'aspect-[16/9]' : 'aspect-square'
  const originalText = String(original.excerpt || original.description || original.content || '').trim()
  const isOwnRepost = reposterId === userId
  const defaultCopyLink = () => {
    if (typeof window !== 'undefined' && originalHref && originalHref !== '#') {
      void navigator.clipboard?.writeText(`${window.location.origin}${originalHref}`)
    }
  }
  const safeOnCopyLink = onCopyLink || defaultCopyLink
  const safeOnHide = onHide || (() => {})
  const safeOnNotInterested = onNotInterested || (() => {})
  const canShowMenu = Boolean(isOwnRepost || onHide || onNotInterested || onCopyLink || onEdit || onPrivacyChange || onDelete || onArchive || onRestore)
  const [confirmAction, setConfirmAction] = useState(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editText, setEditText] = useState(item.repost_quote || '')

  const handleConfirmAction = () => {
    const action = confirmAction
    setConfirmAction(null)
    if (action === 'archive') onArchive?.()
    if (action === 'delete') onDelete?.()
  }

  const handleEditSubmit = (event) => {
    event.preventDefault()
    setEditOpen(false)
    onEdit?.(editText.trim() || null)
  }

  return (
    <>
      <div className="flex items-center gap-2 text-[11px] text-slate-600">
        <Link href={reposterId ? `/info/user/profile/${reposterId}` : '#'} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700" aria-label={`View ${reposterDisplayName}'s profile`}>
          {reposter?.profile_image_url ? <img src={reposter.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(reposterDisplayName)}
        </Link>
        <Link href={reposterId ? `/info/user/profile/${reposterId}` : '#'} className="font-bold text-slate-900 hover:text-sky-700">{reposterDisplayName}</Link>
        <span aria-hidden="true" className="text-emerald-600">🔄</span>
        <span>reposted</span>
        <span className="text-slate-400">·</span>
        <time dateTime={item.reposted_at || item.created_at || undefined}>{formatRelativeTime(item.reposted_at || item.created_at)}</time>
        {canShowMenu && <div className="relative z-30 ml-auto">
          <PostActionMenu
            isRepost
            visibility={item.visibility}
            onEdit={isOwnRepost && onEdit ? () => { setEditText(item.repost_quote || ''); setEditOpen(true) } : undefined}
            onPrivacyChange={isOwnRepost ? onPrivacyChange : undefined}
            onRestore={isOwnRepost ? onRestore : undefined}
            onArchive={isOwnRepost && onArchive ? () => setConfirmAction('archive') : undefined}
            onDelete={isOwnRepost && onDelete ? () => setConfirmAction('delete') : undefined}
            onHide={isOwnRepost ? undefined : safeOnHide}
            onNotInterested={isOwnRepost ? undefined : safeOnNotInterested}
            onCopyLink={safeOnCopyLink}
          />
        </div>}
      </div>

      <ConfirmationModal
        isOpen={Boolean(confirmAction)}
        title={confirmAction === 'delete' ? 'Delete repost?' : 'Archive repost?'}
        message={confirmAction === 'delete'
          ? 'This will permanently remove your repost.'
          : 'This will hide the repost from your profile and feed.'}
        confirmText={confirmAction === 'delete' ? 'Delete post' : 'Archive post'}
        cancelText="Cancel"
        isDangerous={confirmAction === 'delete'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-repost-title">
          <form onSubmit={handleEditSubmit} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h2 id="edit-repost-title" className="text-lg font-semibold text-slate-900">Edit repost comment</h2>
            <textarea
              autoFocus
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              rows={4}
              className="mt-4 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              aria-label="Repost comment"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setEditOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">Save changes</button>
            </div>
          </form>
        </div>
      )}

      {item.repost_quote && <p className="mt-2 break-words text-[15px] leading-6 text-slate-900">{item.repost_quote}</p>}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="px-0 py-0">
          <div className="flex items-center gap-2 px-3 pt-3">
            <Link href={originalAuthor.id ? `/info/user/profile/${originalAuthor.id}` : originalHref} className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-[10px] font-black text-sky-700">
              {originalAuthor.profile_image_url ? <img src={originalAuthor.profile_image_url} alt="" className="h-full w-full object-cover" /> : getInitials(originalAuthorName)}
            </Link>
            <Link href={originalAuthor.id ? `/info/user/profile/${originalAuthor.id}` : originalHref} className="min-w-0 truncate text-sm font-bold text-slate-900 hover:text-sky-700">{originalAuthorName}</Link>
            <span className="text-slate-400">·</span>
            <time className="text-xs text-slate-500" dateTime={original.created_at || undefined}>{formatRelativeTime(original.created_at)}</time>
          </div>

          {original.title && <Link href={originalHref} className="mt-3 block px-3 text-base font-extrabold leading-6 text-slate-950 hover:text-sky-700">{original.title}</Link>}
          {originalText && <p className="mt-2 break-words whitespace-pre-wrap px-3 text-sm leading-6 text-slate-700">{originalText}</p>}

          {originalHref && originalHref !== '#' && (
            <div className="mt-3 px-3">
              <Link href={originalHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-800">
                See original post
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}

          {(mediaItems.length > 0) && (
            <div className="mt-4 w-full overflow-hidden border-t border-slate-200 bg-slate-100">
              <div className={`grid gap-1 ${previewGrid}`}>
                {previewMedia.map((media, index) => {
                  const isWideCover = previewMedia.length === 3 && index === 0
                  const showMoreOverlay = hiddenMediaCount > 0 && index === previewMedia.length - 1
                  return (
                    <Link
                      key={`${media.type}-${media.url}-${index}`}
                      href={originalHref}
                      aria-label={showMoreOverlay ? `See all ${mediaItems.length} media items in the original post` : `Open original post media ${index + 1}`}
                      className={`group relative block w-full overflow-hidden bg-slate-200 ${isWideCover ? 'col-span-2' : ''} ${previewTileAspect}`}
                    >
                      {media.type === 'video' ? (
                        <>
                          <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                          <span className="absolute inset-0 bg-black/10" />
                          <span className="absolute inset-x-0 bottom-2 flex items-center justify-between px-2">
                            <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Video</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sky-700 shadow-sm">
                              <Play className="ml-0.5 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                            </span>
                          </span>
                        </>
                      ) : (
                        <img src={media.url} alt={media.label} className="h-full w-full object-cover transition duration-300 group-hover:brightness-90" loading="lazy" draggable={false} />
                      )}

                      {showMoreOverlay && (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-white transition group-hover:bg-black/70">
                          <span className="text-2xl font-extrabold leading-none tabular-nums">+{hiddenMediaCount}</span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">See more</span>
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {originalId && <div className="mt-3 px-3 pb-3"><SocialActionBar contentType={originalType} contentId={originalId} repostContentType={repostTarget.contentType} repostContentId={repostTarget.contentId} userId={userId} originalPost={{ ...original, id: originalId, author: originalAuthor }} commentCount={commentCount} onToggleComments={onToggleComments} isSaved={isSaved} onToggleSave={onToggleSave} /></div>}
        </div>
      </div>
    </>
  )
}
