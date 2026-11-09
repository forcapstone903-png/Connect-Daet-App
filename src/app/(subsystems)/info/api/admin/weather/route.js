import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { getDaetWeather } from '@/lib/daetWeather'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  try {
    const weather = await getDaetWeather()
    return response({ success: true, weather })
  } catch (error) {
    console.error('Admin weather request failed:', error)
    return response({ success: false, message: 'Live weather data is temporarily unavailable.' }, 502)
  }
}
