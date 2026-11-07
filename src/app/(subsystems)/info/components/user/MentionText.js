'use client'

import Link from 'next/link'
import { renderMentionText } from '@/lib/mentions'

export default function MentionText({ text = '', mentions = [], className = '' }) {
  return (
    <span className={className}>
      {renderMentionText(text, mentions).map((part, index) => (
        part.type === 'mention' ? (
          String(part.userId).startsWith('mention-') ? (
            <span key={`${part.userId}-${index}`} className="font-bold text-sky-700">{part.value.startsWith('@') ? part.value : `@${part.value}`}</span>
          ) : (
            <Link
              key={`${part.userId}-${index}`}
              href={`/user/profile/${encodeURIComponent(part.userId)}?from=comments`}
              className="font-bold text-sky-700 hover:underline"
            >
              {part.value}
            </Link>
          )
        ) : (
          <span key={`text-${index}`}>{part.value}</span>
        )
      ))}
    </span>
  )
}
