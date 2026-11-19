import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  return NextResponse.json(
    { success: false, message: 'Use the Moderation report queue for report investigation.' },
    { status: 410, headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' } }
  )
}