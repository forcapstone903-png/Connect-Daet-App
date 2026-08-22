'use client'

import { useState } from 'react'
import { MessageSquare, Bookmark } from 'lucide-react'
import Reactions from './Reactions'
import ShareRepost from './ShareRepost'

export default function SocialActionBar({ contentType, contentId, userId, commentCount = 0, onToggleComments }) {
  const [showShareMenu, setShowShareMenu] = useState(false)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
      <Reactions contentType={contentType} contentId={contentId} userId={userId} compact />

      <button
        type="button"
        onClick={onToggleComments}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Comment</span>
        {commentCount > 0 && <span className="font-bold">{commentCount}</span>}
      </button>

      <ShareRepost contentType={contentType} contentId={contentId} userId={userId} />
    </div>
  )
}