'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthCookieFromDocument } from '@/lib/authCookies'
import { supabase } from '@/lib/supabase'
import { getStaffHomePath } from '@/lib/staffRoles.mjs'

export default function SplashPage() {
  const router = useRouter()

  useEffect(() => {
    const checkSession = async () => {
      const cookieSession = getAuthCookieFromDocument()
      const { data: { session } } = await supabase.auth.getSession()

      if (cookieSession?.logged_in || session) {
        const role = String(cookieSession?.role || session?.user?.user_metadata?.user_type || '').toLowerCase()
        router.push(getStaffHomePath(role))
        return
      }

      router.push('/info/visitor')
    }

    checkSession()
  }, [router])

  return null
}
