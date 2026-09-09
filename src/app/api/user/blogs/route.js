import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const userId = getServerSession(request)?.user_id

  if (!userId) {
    return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Blog service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const title = String(body.title || '').trim()
    const content = String(body.content || '').trim()
    const category = String(body.category || '').trim()
    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : []
    const videos = Array.isArray(body.videos) ? body.videos.filter(Boolean) : []

    if (!title || !content || !category) {
      return NextResponse.json({ success: false, message: 'Please add a title, category, and article content.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)
    const basePayload = {
      title,
      slug: body.slug,
      excerpt: body.excerpt || content.slice(0, 180),
      content,
      featured_image: body.featured_image || null,
      category,
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: body.status === 'published' ? 'published' : 'draft',
      created_by: userId,
      published_at: body.status === 'published' ? new Date().toISOString() : null,
      views: 0,
      likes: 0,
      comments_count: 0,
    }

    const mediaPayload = {
      ...basePayload,
      images,
      videos,
      media_layout: body.media_layout === 'grid' ? 'grid' : 'swipe',
    }

    const targetColumns = ['images', 'videos', 'media_layout']
    const { data, error } = await adminSupabase
      .from('info_blogs')
      .insert(mediaPayload)
      .select('id')
      .single()

    if (error) {
      const errorText = String(error?.message || '')
      const missingColumn = error?.code === '42703' || errorText.toLowerCase().includes('column')
      const missingRelation = errorText.toLowerCase().includes('relation')
      const shouldFallback = missingColumn || missingRelation || targetColumns.some((column) => errorText.toLowerCase().includes(column))

      if (shouldFallback) {
        const fallback = { ...basePayload }
        const fallbackResult = await adminSupabase
          .from('info_blogs')
          .insert(fallback)
          .select('id')
          .single()

        if (fallbackResult.error) {
          const fallbackMessage = fallbackResult.error?.message || 'Unable to create your blog article.'
          console.error('Blog fallback insert failed:', fallbackMessage)
          return NextResponse.json({ success: false, message: fallbackMessage }, { status: 500 })
        }
        return NextResponse.json({ success: true, blog: fallbackResult.data })
      }

      const typedMessage = error?.message || 'Unable to create your blog article.'
      return NextResponse.json({ success: false, message: typedMessage }, { status: 500 })
    }

    return NextResponse.json({ success: true, blog: data })
  } catch (error) {
    const errorMessage = error?.message || 'Unable to create your blog article.'
    console.error('Blog creation failed:', errorMessage)
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 })
  }
}