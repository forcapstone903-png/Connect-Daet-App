'use client'

import { useState } from 'react'
import { Bookmark, MessageCircle } from 'lucide-react'
import Reactions from './Reactions'
import ShareRepost from './ShareRepost'

export default function SocialActionBar({ contentType, contentId, userId, commentCount = 0, onToggleComments, isSaved = false, onToggleSave }) {
  const [showShareMenu, setShowShareMenu] = useState(false)

  return (
    <div className="mt-3 grid min-w-0 grid-cols-4 items-center gap-2 border-t border-slate-100 pt-3">
      <div className="min-w-0">
        <Reactions contentType={contentType} contentId={contentId} userId={userId} compact fullWidth />
      </div>

      <button
        type="button"
        onClick={onToggleComments}
        className="inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        title="Comments"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span className="font-bold">{commentCount}</span>
      </button>

      <div className="min-w-0">
        <ShareRepost contentType={contentType} contentId={contentId} userId={userId} fullWidth />
      </div>

      <button
        type="button"
        onClick={onToggleSave}
        className={`inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-slate-200 ${isSaved ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}
        title={isSaved ? 'Remove from saved items' : 'Save post'}
      >
        <Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} />
        <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
      </button>
    </div>
  )
}