'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isValidUuid } from '@/lib/uuid'
import SocialActionBar from '@/app/components/user/SocialActionBar'

function normalizeFavoriteItemType(value) {
  if (!value) return value

  const type = String(value).trim().toLowerCase()
  if (type === 'forum_thread' || type === 'forum') return 'forum'
  if (type === 'user_post' || type === 'post') return 'user_post'
  if (type === 'tourist_spot' || type === 'spot') return 'tourist_spot'
  return type
}

function getContentType(post) {
  if (post.original_content_type) return normalizeFavoriteItemType(post.original_content_type)
  return normalizeFavoriteItemType(post.type)
}

export default function ProfileFeedActions({ post, userId, onRepost }) {
  const router = useRouter()
  const contentType = getContentType(post)
  const contentId = post.original_content_id || (post.isRepost ? post.original_post?.id : post.id)
  const [isSaved, setIsSaved] = useState(false)

  useEffect(() => {
    if (!userId || !contentId || !isValidUuid(String(contentId)) || String(contentId).startsWith('repost-')) return undefined

    let active = true
    supabase
      .from('user_favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('item_type', contentType)
      .eq('item_id', contentId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsSaved(Boolean(data))
      })

    return () => { active = false }
  }, [contentId, contentType, userId])

  const handleSave = async (event) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (!userId || !contentId || !isValidUuid(String(contentId)) || String(contentId).startsWith('repost-')) return

    const query = isSaved
      ? supabase.from('user_favorites').delete().eq('user_id', userId).eq('item_type', contentType).eq('item_id', contentId)
      : supabase.from('user_favorites').upsert({ user_id: userId, item_type: contentType, item_id: contentId }, { onConflict: 'user_id,item_type,item_id' })
    const { error } = await query
    if (!error) setIsSaved((saved) => !saved)
  }

  return (
    <SocialActionBar
      contentType={contentType}
      contentId={contentId}
      userId={userId}
      commentCount={post.commentsCount || 0}
      onToggleComments={() => router.push(post.href)}
      isSaved={isSaved}
      onToggleSave={handleSave}
      onRepost={onRepost}
      originalPost={{ ...post, id: contentId }}
    />
  )
}