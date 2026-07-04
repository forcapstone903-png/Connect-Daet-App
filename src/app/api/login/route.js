import { loginStoredUser } from '@/lib/authStorage'

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return Response.json(
        { success: false, message: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const result = loginStoredUser({ email, password })

    if (!result.success) {
      return Response.json(result, { status: 401 })
    }

    return Response.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        user_type: result.user.user_type,
        status: result.user.status,
      },
    })
  } catch (error) {
    console.error('Login endpoint error:', error)
    return Response.json(
      { success: false, message: 'Unable to sign in right now.' },
      { status: 500 }
    )
  }
}
