import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  const checks = {
    api: { status: 'Available', detail: 'The administrator health endpoint responded.' },
    database: { status: 'Unavailable', detail: 'No database check was completed.' },
    storage: { status: 'Unavailable', detail: 'No storage check was completed.' },
    emailConfiguration: { status: 'Not configured', detail: 'SendGrid credentials are not configured.' },
    weatherConfiguration: {
      status: 'Not required',
      detail: 'The Open-Meteo weather provider does not require an API key; provider reachability is not checked here.',
    },
  }

  if (client) {
    const [databaseResult, storageResult] = await Promise.all([
      client.from('info_users').select('id').limit(1),
      client.storage.listBuckets(),
    ])
    checks.database = databaseResult.error
      ? { status: 'Unavailable', detail: 'A database connectivity check failed.' }
      : { status: 'Available', detail: 'A query to the application database succeeded.' }
    checks.storage = storageResult.error
      ? { status: 'Unavailable', detail: 'A storage service connectivity check failed.' }
      : { status: 'Available', detail: 'The storage service returned its bucket list.' }
  } else {
    checks.database.detail = 'Database server credentials are not configured.'
    checks.storage.detail = 'Database server credentials are not configured.'
  }

  if (process.env.SENDGRID_API_KEY?.trim() && process.env.SENDGRID_FROM_EMAIL?.trim()) {
    checks.emailConfiguration = { status: 'Configured', detail: 'Required SendGrid environment variables are present.' }
  }
  return NextResponse.json({ success: true, checkedAt: new Date().toISOString(), checks }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
