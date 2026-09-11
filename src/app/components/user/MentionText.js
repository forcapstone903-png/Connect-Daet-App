'use client'

import Link from 'next/link'
import { renderMentionText } from '@/lib/mentions'

export default function MentionText({ text = '', mentions = [], className = '' }) {
  return (
    <span className={className}>
      {renderMentionText(text, mentions).map((part, index) => (
        part.type === 'mention' ? (
          <Link
            key={`${part.userId}-${index}`}
            href={`/user/profile/${encodeURIComponent(part.userId)}`}
            className="font-bold text-sky-700 hover:underline"
          >
            {part.value}
          </Link>
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        )
      ))}
    </span>
  )
}
