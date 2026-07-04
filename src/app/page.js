'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function SplashPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Check if user is already logged in
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.push('/dashboard')
      } else {
        router.push('/welcome')
      }
    }, 2800)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-teal-800 via-teal-600 to-teal-400">
      <div className="flex flex-col items-center gap-4">
        {/* Logo */}
        <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-sm">
            <span className="text-3xl font-medium text-teal-800 tracking-tight">DC</span>
          </div>
        </div>

        <h1 className="text-white text-2xl font-medium tracking-tight">Daet Connect</h1>
        <p className="text-white/70 text-sm">Discover · Connect · Explore</p>

        {/* Loading dots */}
        <div className="flex gap-2 mt-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-white/40"
              style={{
                animation: 'dotPulse 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`
              }}
            />
          ))}
        </div>
      </div>

    </div>
  )
}