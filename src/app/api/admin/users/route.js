import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for user administration.' },
    { status: 500 }
  )
}

export async function GET() {
  if (!adminSupabase) return missingConfig()

  try {
    const { data, error } = await adminSupabase
      .from('info_users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin users fetch error:', error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, users: data || [] })
  } catch (error) {
    console.error('Admin users route error:', error)
    return NextResponse.json(
      { success: false, message: error.message || 'Unable to load users right now.' },
      { status: 500 }
    )
  }
}
