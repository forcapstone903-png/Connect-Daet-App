'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { supabase } from '@/lib/supabase'

export default function SplashPage() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const cookieSession = getAuthCookieFromDocument()
      const { data: { session } } = await supabase.auth.getSession()

      if (cookieSession?.logged_in || session) {
        const role = String(cookieSession?.role || session?.user?.user_metadata?.user_type || '').toLowerCase()
        if (role === 'admin') {
          router.push('/admin/dashboard')
        } else {
          router.push('/user/dashboard')
        }
        return
      }

      router.push('/welcome')
    }

    checkSession()
  }, [router])

  return null
}
