'use client'

import { useState } from 'react'
import Reactions from './Reactions'
import ShareRepost from './ShareRepost'

export default function SocialActionBar({ contentType, contentId, userId, commentCount = 0, onToggleComments }) {
  const [showShareMenu, setShowShareMenu] = useState(false)

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
      <div className="min-w-0">
        <Reactions contentType={contentType} contentId={contentId} userId={userId} compact label="Likes" />
      </div>

      <button
        type="button"
        onClick={onToggleComments}
        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 sm:min-h-0"
      >
        <span aria-hidden="true" className="text-sm leading-none">+</span>
        <span className="hidden sm:inline">Comments</span>
        <span className="font-bold">{commentCount}</span>
      </button>

      <div className="col-span-2 min-w-0 sm:col-span-1">
        <ShareRepost contentType={contentType} contentId={contentId} userId={userId} />
      </div>
    </div>
  )
}