import { createClient } from '@supabase/supabase-js'
import { registerStoredUser } from '@/lib/authStorage'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

export async function POST(request) {
  try {
    const { full_name, email, password, user_type } = await request.json()

    if (!full_name || !email || !password) {
      return Response.json(
        { success: false, message: 'Please fill in all required fields.' },
        { status: 400 }
      )
    }

    const result = registerStoredUser({ full_name, email, password, user_type })

    if (!result.success) {
      return Response.json(result, { status: 409 })
    }

    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedUserType = String(user_type || 'tourist').trim().toLowerCase()

    try {
      const { error } = await supabaseAdmin.from('info_users').upsert(
        {
          id: result.user.id,
          email: normalizedEmail,
          password: String(password || '').trim(),
          full_name: String(full_name || '').trim(),
          user_type: normalizedUserType,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_online: true,
        },
        { onConflict: 'email' }
      )

      if (error) {
        throw error
      }
    } catch (profileError) {
      console.error('Profile sync failed:', profileError)
      return Response.json(
        {
          success: false,
          message: 'Account was created, but the profile could not be synced. Please try again.',
        },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      user: result.user,
    })
  } catch (error) {
    console.error('Register endpoint error:', error)
    return Response.json(
      { success: false, message: 'Unable to register your account right now.' },
      { status: 500 }
    )
  }
}
