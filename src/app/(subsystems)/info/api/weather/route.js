import { NextResponse } from 'next/server'
import { getDaetWeather } from '@/lib/daetWeather'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const weather = await getDaetWeather({ allowStale: true })
    return NextResponse.json(
      { success: true, weather },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('Visitor weather request failed:', error)
    return NextResponse.json(
      { success: false, message: 'Daet weather is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
