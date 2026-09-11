import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { parseMentionCandidates } from '@/lib/mentions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Comment service is not configured.' }, { status: 500 })
  }

  const blogId = new URL(request.url).searchParams.get('blogId')?.trim()
  if (!blogId) return NextResponse.json({ success: false, message: 'Blog id is required.' }, { status: 400 })

  try {
    const viewerId = getServerSession(request)?.user_id || null
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    let query = adminSupabase
      .from('info_comments')
      .select('*, info_users(full_name, email, profile_image_url)')
      .eq('blog_id', blogId)
      .order('created_at', { ascending: false })

    if (viewerId) query = query.or(`status.eq.approved,user_id.eq.${viewerId}`)
    else query = query.eq('status', 'approved')

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, comments: data || [] })
  } catch (error) {
    console.error('Blog comments load failed:', error.message || error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load comments.' }, { status: 500 })
  }
}

function isMissingNotificationColumn(error) {
  return error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''))
}

async function createBlogCommentNotification(adminSupabase, { recipientId, actorId, blogId, blogOwnerId, actorName, content, commentId, isReply }) {
  if (!recipientId || recipientId === actorId) return

  const actionText = isReply ? 'replied to your comment' : 'commented on your post'
  const notificationMessage = `${actorName} ${actionText}: ${content.slice(0, 120)}`
  const link = `/user/blogs/${blogId}#comment-${commentId || ''}`
  const { data: existing } = await adminSupabase
    .from('info_notifications')
    .select('id')
    .eq('user_id', recipientId)
    .eq('link', link)
    .eq('type', 'comment')
    .eq('actor_id', actorId)
    .limit(1)

  if (existing?.length) return

  const notification = {
    user_id: recipientId,
    title: isReply ? 'New reply to your comment' : 'New comment on your post',
    message: notificationMessage,
    type: 'comment',
    is_read: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    link,
    post_id: blogId,
    comment_id: commentId || null,
    reply_id: isReply ? commentId || null : null,
    post_owner_id: blogOwnerId,
    actor_id: actorId,
  }

  let { error: notificationError } = await adminSupabase.from('info_notifications').insert(notification)
  if (isMissingNotificationColumn(notificationError)) {
    const { post_id, post_owner_id, ...baseNotification } = notification
    const fallbackResult = await adminSupabase.from('info_notifications').insert(baseNotification)
    notificationError = fallbackResult.error
    if (isMissingNotificationColumn(notificationError)) {
      const { actor_id, ...legacyNotification } = baseNotification
      const legacyResult = await adminSupabase.from('info_notifications').insert(legacyNotification)
      notificationError = legacyResult.error
    }
  }

  if (notificationError && notificationError.code !== '23505') {
    console.error('Blog comment notification failed:', notificationError.message || notificationError)
  }
}

async function persistBlogCommentMentions(adminSupabase, text, actorId, commentId) {
  const mentions = []
  for (const candidate of parseMentionCandidates(text)) {
    const exactResult = await adminSupabase
      .from('info_users')
      .select('id, full_name')
      .ilike('full_name', candidate.displayName)
      .limit(2)
    let user = (exactResult.data || []).length === 1 ? exactResult.data[0] : null
    if (!user) {
      const prefixResult = await adminSupabase
        .from('info_users')
        .select('id, full_name')
        .ilike('full_name', `${candidate.displayName}%`)
        .limit(2)
      const prefixMatches = prefixResult.data || []
      user = prefixMatches.length === 1 ? prefixMatches[0] : null
    }

    if (!user?.id || user.id === actorId || mentions.some((mention) => mention.mentioned_user_id === user.id)) continue
    mentions.push({
      mentioned_user_id: user.id,
      display_name: candidate.displayName,
      mentioned_by_user_id: actorId,
      content_type: 'comment',
      content_id: commentId,
      mention_text: candidate.displayName,
    })
  }

  if (mentions.length) {
    await adminSupabase.from('mentions').upsert(mentions, {
      onConflict: 'mentioned_user_id,content_type,content_id,mentioned_by_user_id',
      ignoreDuplicates: true,
    })
  }

  return mentions
}

export async function POST(request) {
  const userId = getServerSession(request)?.user_id || null
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Please log in to comment.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Comment service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const blogId = String(body.blogId || '').trim()
    const content = String(body.content || '').trim()
    const parentId = body.parentId ? String(body.parentId).trim() : null

    if (!blogId || !content) {
      return NextResponse.json({ success: false, message: 'Comment content is required.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: blog, error: blogError } = await adminSupabase
      .from('info_blogs')
      .select('id, title, status, created_by')
      .eq('id', blogId)
      .eq('status', 'published')
      .maybeSingle()

    if (blogError) throw blogError
    if (!blog) return NextResponse.json({ success: false, message: 'This blog is no longer available.' }, { status: 404 })

    const { data, error } = await adminSupabase
      .from('info_comments')
      .insert({
        blog_id: blogId,
        parent_id: parentId,
        user_id: userId,
        content,
        status: 'approved',
      })
      .select('*, info_users(full_name, email, profile_image_url)')
      .single()

    if (error) throw error

    const { data: actor } = await adminSupabase
      .from('info_users')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle()
    const actorName = actor?.full_name || actor?.email || 'Someone'

    if (blog.created_by) {
      const { data: parentComment } = parentId
        ? await adminSupabase.from('info_comments').select('user_id').eq('id', parentId).maybeSingle()
        : { data: null }

      const recipients = new Set([blog.created_by, parentComment?.user_id].filter(Boolean))
      for (const recipientId of recipients) {
        await createBlogCommentNotification(adminSupabase, {
          recipientId,
          actorId: userId,
          blogId,
          blogOwnerId: blog.created_by,
          actorName,
          content,
          commentId: data.id,
          isReply: Boolean(parentId && recipientId === parentComment?.user_id),
        })
      }
    }

    const mentionRows = await persistBlogCommentMentions(adminSupabase, content, userId, data.id)
    const mentionData = mentionRows.map((mention) => ({ mentioned_user_id: mention.mentioned_user_id, display_name: mention.display_name || mention.mention_text }))
    if (mentionData.length) {
      await adminSupabase.from('info_comments').update({ mention_data: mentionData }).eq('id', data.id)
      data.mention_data = mentionData
    }
    for (const mention of mentionRows) {
      await createBlogCommentNotification(adminSupabase, {
        recipientId: mention.mentioned_user_id,
        actorId: userId,
        blogId,
        blogOwnerId: blog.created_by,
        actorName,
        content,
        commentId: data.id,
        isReply: false,
      })
    }

    return NextResponse.json({ success: true, comment: data })
  } catch (error) {
    console.error('Blog comment creation failed:', error.message || error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to submit your comment.' }, { status: 500 })
  }
}
