import { getStoredUsers } from '@/lib/authStorage'

export async function GET() {
  try {
    return Response.json({ success: true, users: getStoredUsers() })
  } catch (error) {
    console.error('Admin users route error:', error)
    return Response.json(
      { success: false, message: 'Unable to load users right now.' },
      { status: 500 }
    )
  }
}
