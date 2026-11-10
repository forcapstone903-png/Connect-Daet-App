import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function isMissingUsernameColumn(error) {
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ')
  return error?.code === '42703'
    || error?.code === 'PGRST204'
    || /(?:column|schema cache).*username|username.*(?:column|does not exist|schema cache)/i.test(details)
}

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) {
    return NextResponse.json({ success: false, message: 'Please log in to view your profile.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ success: false, message: 'Profile service is not configured.' }, { status: 500 })
  }

  try {
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    let { data: account, error: accountError } = await adminSupabase
      .from('info_users')
      .select('id, email, full_name, username, phone_number, email_verified, profile_image_url, last_login')
      .eq('id', session.user_id)
      .maybeSingle()

    // Usernames were added after the original profile schema. A database that
    // has not applied that optional migration must still be able to load profile
    // details used by the rest of Settings.
    if (accountError && isMissingUsernameColumn(accountError)) {
      const fallbackResult = await adminSupabase
        .from('info_users')
        .select('id, email, full_name, phone_number, email_verified, profile_image_url, last_login')
        .eq('id', session.user_id)
        .maybeSingle()
      account = fallbackResult.data
      accountError = fallbackResult.error
    }

    if (accountError) throw accountError
    if (!account) return NextResponse.json({ success: false, message: 'Profile not found.' }, { status: 404 })

    return NextResponse.json({
      success: true,
      profile: {
        fullName: account.full_name || '',
        username: account.username || '',
        email: account.email || '',
        emailVerified: Boolean(account.email_verified),
        phoneNumber: account.phone_number || '',
        avatarUrl: account.profile_image_url || '',
        lastLoginAt: account.last_login || null,
      },
    }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Profile summary fetch failed:', {
      code: error.code || null,
      name: error.name || null,
    })
    return NextResponse.json({ success: false, message: 'Unable to load your profile.' }, {
      status: 500,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  }
}

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
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, message: 'A valid profile update is required.' }, { status: 400 })
    }
    const fullName = String(body.fullName || '').trim()
    const bio = String(body.bio || '').trim()
    const location = String(body.location || '').trim()
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const avatarUrl = typeof body.avatarUrl === 'string' && body.avatarUrl.trim() ? body.avatarUrl.trim() : null
    const coverPhotoUrl = typeof body.coverPhotoUrl === 'string' && body.coverPhotoUrl.trim() ? body.coverPhotoUrl.trim() : null
    if (!fullName || fullName.length > 80 || bio.length > 1000 || location.length > 120) {
      return NextResponse.json({ success: false, message: 'Check the name, bio, and location lengths.' }, { status: 400 })
    }
    if (username && !/^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$/.test(username)) {
      return NextResponse.json({ success: false, message: 'Username must be 3-30 characters, start and end with a letter or number, and contain only letters, numbers, dots, or underscores.' }, { status: 400 })
    }
    if (phoneNumber && (!/^[+()\d.\-\s]{6,30}$/.test(phoneNumber) || !/\d{6,}/.test(phoneNumber))) {
      return NextResponse.json({ success: false, message: 'Enter a valid phone number or leave the field blank.' }, { status: 400 })
    }
    const locationParts = location.split(',').map((part) => part.trim()).filter(Boolean)
    const city = locationParts[0] || null
    const country = locationParts.slice(1).join(', ') || null
    const updatedAt = new Date().toISOString()
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey)

    const userUpdates = {
      full_name: fullName,
      phone_number: phoneNumber || null,
      bio,
      city,
      country,
      profile_image_url: avatarUrl,
      updated_at: updatedAt,
    }
    let { error: userError } = await adminSupabase
      .from('info_users')
      .update({ ...userUpdates, username: username || null })
      .eq('id', session.user_id)

    if (userError && isMissingUsernameColumn(userError) && !username) {
      const fallbackResult = await adminSupabase
        .from('info_users')
        .update(userUpdates)
        .eq('id', session.user_id)
      userError = fallbackResult.error
    } else if (userError && isMissingUsernameColumn(userError)) {
      return NextResponse.json({
        success: false,
        message: 'Username updates are temporarily unavailable. Please try again later.',
      }, { status: 503 })
    }

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
    if (error.code === '23505') {
      return NextResponse.json({ success: false, message: 'That username is already in use.' }, { status: 409 })
    }
    return NextResponse.json({ success: false, message: error.message || 'Unable to update your profile.' }, { status: 500 })
  }
}
