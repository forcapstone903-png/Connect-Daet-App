import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function emailConfiguration() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim()
  return {
    configured: Boolean(apiKey && fromEmail),
    fromEmail: fromEmail || null,
  }
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const config = emailConfiguration()
  return response({
    success: true,
    provider: 'SendGrid',
    configured: config.configured,
    fromEmail: config.fromEmail,
  })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim()
  if (!apiKey || !fromEmail) {
    return response({
      success: false,
      message: 'Email delivery is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on the server.',
    }, 503)
  }

  if (!adminSupabase) {
    return response({ success: false, message: 'Admin email lookup is not configured on the server.' }, 500)
  }

  try {
    const { data: admin, error: adminError } = await adminSupabase
      .from('info_users')
      .select('email')
      .eq('id', session.user_id)
      .eq('user_type', 'admin')
      .maybeSingle()

    if (adminError) {
      console.error('Admin test-email recipient lookup failed:', adminError)
      return response({ success: false, message: 'Unable to look up the administrator email address.' }, 500)
    }

    if (!admin?.email) {
      return response({ success: false, message: 'No email address is associated with this administrator account.' }, 400)
    }

    sgMail.setApiKey(apiKey)
    await sgMail.send({
      to: admin.email,
      from: fromEmail,
      subject: 'Connect Daet email delivery test',
      text: 'This is a test email initiated from the Connect Daet administrator settings.',
      html: '<p>This is a test email initiated from the Connect Daet administrator settings.</p>',
    })

    return response({ success: true, message: 'Test email sent to the administrator account email.' })
  } catch (error) {
    console.error('Admin test email delivery failed:', {
      code: error.code || null,
      status: error.response?.statusCode || null,
    })
    return response({ success: false, message: 'The email provider could not deliver the test message.' }, 502)
  }
}
