import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function unavailable() {
  return NextResponse.json({
    success: false,
    message: 'Suspension reviews are available in the Moderation report queue.',
  }, {
    status: 410,
    headers: { 'Cache-Control': 'private, no-store, no-cache, must-revalidate' },
  })
}

export async function GET(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  return unavailable()
}

export async function PATCH(request) {
  const authorization = authorizeAdminApi(request)
  if (authorization.response) return authorization.response
  return unavailable()
}