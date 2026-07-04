import { supabase } from '@/lib/supabase'

export async function POST(request) {
  try {
    const { email } = await request.json()
    
    // Use the real Supabase client
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    })

    if (error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    return Response.json({ 
      message: 'Password reset email sent successfully' 
    })
    
  } catch (error) {
    return Response.json({ 
      error: 'An error occurred processing your request' 
    }, { status: 500 })
  }
}