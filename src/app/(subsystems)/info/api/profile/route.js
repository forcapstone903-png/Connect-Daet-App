import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'Please log in to update your profile.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Profile service is not configured.' }, { status: 500 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const fullName = String(body.fullName || '').trim()
    const bio = String(body.bio || '').trim()
    const location = String(body.location || '').trim()
    const avatarUrl = typeof body.avatarUrl === 'string' && body.avatarUrl.trim() ? body.avatarUrl.trim() : null
    const coverPhotoUrl = typeof body.coverPhotoUrl === 'string' && body.coverPhotoUrl.trim() ? body.coverPhotoUrl.trim() : null
    const locationParts = location.split(',').map((part) => part.trim()).filter(Boolean)
    const city = locationParts[0] || null
    const country = locationParts.slice(1).join(', ') || null
    const updatedAt = new Date().toISOString()
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    const { error: userError } = await adminSupabase
      .from('info_users')
      .update({
        full_name: fullName,
        bio,
        city,
        country,
        profile_image_url: avatarUrl,
        updated_at: updatedAt,
      })
      .eq('id', session.user_id)

    if (userError) throw userError

    const { error: profileError } = await adminSupabase
      .from('profiles')
      .upsert({
        user_id: session.user_id,
        full_name: fullName,
        bio,
        city,
        country,
        location: location || null,
        profile_image_url: avatarUrl,
        cover_photo_url: coverPhotoUrl,
        updated_at: updatedAt,
      }, { onConflict: 'user_id' })

    if (profileError) throw profileError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Profile update failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to update your profile.' }, { status: 500 })
  }
}
