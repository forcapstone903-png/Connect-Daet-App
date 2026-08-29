'use client'

import { useState } from 'react'

const DEFAULT_PREVIEW_LENGTH = 160

/**
 * Renders text (e.g. a comment) with a "See more / See less" toggle when it
 * exceeds `previewLength` characters.
 */
export default function CommentText({ text, children, className = '', previewLength = DEFAULT_PREVIEW_LENGTH }) {
  const content = typeof text === 'string' ? text : typeof children === 'string' ? children : ''
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > previewLength
  const display = isLong && !expanded ? `${content.slice(0, previewLength).trimEnd()}…` : content

  return (
    <div className="mt-1.5">
      <p className={`whitespace-pre-line text-sm leading-relaxed text-slate-700 ${className}`}>{display}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-semibold text-sky-600 transition hover:text-sky-700 hover:underline"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  )
}