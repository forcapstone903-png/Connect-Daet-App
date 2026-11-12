import { NextResponse } from 'next/server'
import { getAppSetting } from '@/lib/appSettingsServer'
import { buildPublicSettings } from '@/lib/siteSettings.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Public, non-sensitive site information only (see buildPublicSettings).
// Cache: shared/public, 60 s fresh + 5 min stale-while-revalidate. Saving a
// setting clears the server cache; browsers/CDN pick it up within 60 s.
export async function GET() {
  const [general, security] = await Promise.all([getAppSetting('general'), getAppSetting('security')])
  return NextResponse.json(
    { success: true, settings: buildPublicSettings({ general, security }) },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
  )
}
