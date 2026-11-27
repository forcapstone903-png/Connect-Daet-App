import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isValidUuid } from '@/lib/uuid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const noCacheHeaders = { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? createClient(url, key) : null
}

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: noCacheHeaders })
}

export async function GET(request, { params }) {
  const blogId = (await params)?.id
  if (!isValidUuid(blogId)) return respond({ success: false, message: 'A valid blog ID is required.' }, 400)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return respond({ success: false, message: 'Blog engagement counts are not configured.' }, 500)

  try {
    const now = new Date().toISOString()
    const blogResult = await adminSupabase
      .from('info_blogs')
      .select('id, views, created_by')
      .eq('id', blogId)
      .eq('status', 'published')
      .eq('approval_status', 'approved')
      .or(`published_at.is.null,published_at.lte.${now}`)
      .maybeSingle()
    if (blogResult.error) throw blogResult.error
    if (!blogResult.data) return respond({ success: false, message: 'Blog not found.' }, 404)

    const [heartsResult, savesResult, commentsResult, authorProfileResult] = await Promise.all([
      adminSupabase
        .from('content_reactions')
        .select('id', { count: 'exact', head: true })
        .eq('content_type', 'blog')
        .eq('content_id', blogId)
        .eq('reaction_type', 'like'),
      adminSupabase
        .from('user_favorites')
        .select('id', { count: 'exact', head: true })
        .eq('item_type', 'blog')
        .eq('item_id', blogId),
      adminSupabase
        .from('info_comments')
        .select('id', { count: 'exact', head: true })
        .eq('blog_id', blogId)
        .eq('status', 'approved'),
      blogResult.data.created_by
        ? adminSupabase
            .from('profiles')
            .select('profile_image_url')
            .eq('user_id', blogResult.data.created_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    const failedResult = [heartsResult, savesResult, commentsResult].find((result) => result.error)
    if (failedResult) throw failedResult.error
    if (authorProfileResult.error) {
      console.error('Public blog author profile photo lookup failed:', authorProfileResult.error)
    }

    return respond({
      success: true,
      hearts: heartsResult.count || 0,
      saves: savesResult.count || 0,
      views: Math.max(0, Number(blogResult.data.views) || 0),
      comments: commentsResult.count || 0,
      authorProfileImage: authorProfileResult.data?.profile_image_url || null,
    })
  } catch (error) {
    console.error('Public blog engagement counts failed:', error)
    return respond({ success: false, message: 'Unable to load blog engagement counts.' }, 500)
  }
}
