'use client'

import { Bookmark, MessageCircle } from 'lucide-react'
import Reactions from './Reactions'
import ShareRepost from './ShareRepost'

export default function SocialActionBar({ contentType, contentId, userId, commentCount = 0, onToggleComments, isSaved = false, onToggleSave, onRepost, originalPost = null, repostContentType, repostContentId }) {
  return (
    <div className="tourism-action-row mt-3 grid min-w-0 grid-cols-4 items-end gap-1.5 pt-3 sm:gap-2">
      <div className="flex min-w-0 items-center justify-center">
        <Reactions contentType={contentType} contentId={contentId} userId={userId} compact fullWidth breakdown />
      </div>

      <button
        type="button"
        onClick={onToggleComments}
        className="tourism-action usr-press usr-lift inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold"
        title="Comments"
        aria-label={`Comments, ${commentCount}`}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span key={commentCount} className="usr-count-pop font-bold">{commentCount}</span>
      </button>

      <div className="flex h-9 min-w-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
        {/* Reactions/comments may key on the repost instance, so the repost
            action takes its own explicit target when one is supplied. */}
        <ShareRepost contentType={repostContentType ?? contentType} contentId={repostContentId ?? contentId} userId={userId} onRepost={onRepost} originalPost={originalPost} fullWidth />
      </div>

      <button
        type="button"
        onClick={onToggleSave}
        className={`tourism-action usr-press usr-lift inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1.5 text-xs font-semibold ${
          isSaved ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50'
        }`}
        title={isSaved ? 'Remove from saved items' : 'Save post'}
        aria-label={isSaved ? 'Remove from saved items' : 'Save post'}
        aria-pressed={isSaved}
      >
        <Bookmark key={isSaved ? 'saved' : 'unsaved'} className={`usr-emoji-pop h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />
        <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  )
}