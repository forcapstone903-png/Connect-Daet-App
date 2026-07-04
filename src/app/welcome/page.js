'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function WelcomePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect if already logged in
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) router.push('/dashboard')
    }
    checkSession()
  }, [router])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Hero section */}
      <div className="flex flex-col items-center justify-center pt-16 pb-10 px-6 bg-gradient-to-br from-teal-800 to-teal-500 rounded-b-[2.5rem]">
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-4 shadow">
          <span className="text-2xl font-medium text-teal-800 tracking-tight">DC</span>
        </div>
        <h1 className="text-white text-2xl font-semibold text-center">
          Welcome to Daet Connect
        </h1>
        <p className="text-white/70 text-sm mt-1 text-center">
          Your gateway to Daet City
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 justify-between px-8 py-10">
        {/* Tagline */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">
            Explore the best of Daet
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            Discover local artisans, tour operators, and one-of-a-kind experiences all in one place.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {['🏖️ Beaches', '🎨 Artisans', '🗺️ Tours', '🍽️ Food'].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-teal-50 text-teal-800 text-xs rounded-full border border-teal-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3 mt-8">
          <Link
            href="/login"
            className="w-full flex items-center justify-center py-3.5 rounded-xl bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition-colors"
          >
            Sign in
          </Link>

          <Link
            href="/register"
            className="w-full flex items-center justify-center py-3.5 rounded-xl bg-white text-teal-700 text-sm font-medium border border-teal-600 hover:bg-teal-50 transition-colors"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  )
}