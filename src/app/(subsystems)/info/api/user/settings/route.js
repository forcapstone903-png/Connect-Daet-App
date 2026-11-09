import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PROFILE_SETTINGS_COLUMNS = 'privacy_level, is_public, language_preference, notification_preferences, privacy_preferences, ui_preferences'
const DEFAULT_NOTIFICATIONS = {
  emailAlerts: true,
  activityDigest: true,
  newFollowers: true,
  forumMentions: true,
  announcementAlerts: false,
}
const DEFAULT_PRIVACY = {
  privacyLevel: 'public',
  showOnlineStatus: true,
  showActivity: true,
  allowMessagesFrom: 'everyone',
  allowMentions: true,
  searchable: true,
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function unavailable(message, status) {
  return NextResponse.json({ success: false, message }, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return unavailable('Please log in to load your settings.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return unavailable('Settings service is not configured.', 500)

  try {
    const { data, error } = await adminSupabase
      .from('profiles')
      .select(PROFILE_SETTINGS_COLUMNS)
      .eq('user_id', session.user_id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({
      success: true,
      user_id: session.user_id,
      profile: data,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Settings profile fetch failed:', error)
    return unavailable(error.message || 'Unable to load your settings.', 500)
  }
}

export async function PUT(request) {
  const session = getServerSession(request)
  if (!session?.user_id) return unavailable('Please log in to save your settings.', 401)

  const adminSupabase = getAdminClient()
  if (!adminSupabase) return unavailable('Settings service is not configured.', 500)

  let body
  try {
    body = await request.json()
  } catch {
    return unavailable('A valid settings object is required.', 400)
  }

  if (!body?.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
    return unavailable('A valid settings object is required.', 400)
  }

  try {
    const settings = body.settings
    const privacy = settings.privacy && typeof settings.privacy === 'object' && !Array.isArray(settings.privacy)
      ? settings.privacy
      : {}
    const notifications = settings.notifications && typeof settings.notifications === 'object' && !Array.isArray(settings.notifications)
      ? settings.notifications
      : {}
    const privacyLevel = ['public', 'followers', 'private'].includes(privacy.privacyLevel) ? privacy.privacyLevel : DEFAULT_PRIVACY.privacyLevel
    const normalizedPrivacy = {
      privacyLevel,
      showOnlineStatus: typeof privacy.showOnlineStatus === 'boolean' ? privacy.showOnlineStatus : DEFAULT_PRIVACY.showOnlineStatus,
      showActivity: typeof privacy.showActivity === 'boolean' ? privacy.showActivity : DEFAULT_PRIVACY.showActivity,
      allowMessagesFrom: ['everyone', 'connections'].includes(privacy.allowMessagesFrom) ? privacy.allowMessagesFrom : DEFAULT_PRIVACY.allowMessagesFrom,
      allowMentions: typeof privacy.allowMentions === 'boolean' ? privacy.allowMentions : DEFAULT_PRIVACY.allowMentions,
      searchable: typeof privacy.searchable === 'boolean' ? privacy.searchable : DEFAULT_PRIVACY.searchable,
    }
    const normalizedNotifications = Object.fromEntries(
      Object.entries(DEFAULT_NOTIFICATIONS).map(([key, defaultValue]) => [
        key,
        typeof notifications[key] === 'boolean' ? notifications[key] : defaultValue,
      ])
    )
    const theme = ['light', 'dark', 'system'].includes(settings.theme) ? settings.theme : 'system'
    const language = ['en', 'fil', 'bik'].includes(settings.language) ? settings.language : 'en'
    const payload = {
      user_id: session.user_id,
      privacy_level: privacyLevel,
      is_public: privacyLevel === 'public',
      language_preference: language,
      notification_preferences: normalizedNotifications,
      privacy_preferences: normalizedPrivacy,
      ui_preferences: {
        theme,
        reduceMotion: settings.reduceMotion === true,
      },
      updated_at: new Date().toISOString(),
    }
    const { error } = await adminSupabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
    if (error) throw error

    return NextResponse.json({ success: true }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (error) {
    console.error('Settings profile update failed:', error)
    return unavailable(error.message || 'Unable to save your settings.', 500)
  }
}
