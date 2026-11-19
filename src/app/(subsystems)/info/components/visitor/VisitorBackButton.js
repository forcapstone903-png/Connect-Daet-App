'use client'

import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function VisitorBackButton({ className = '', fallbackHref = '/info/visitor', label = 'Back' }) {
  const router = useRouter()

  const goBack = () => {
    const referrer = typeof document !== 'undefined' ? document.referrer : ''
    let cameFromThisSite = false
    if (referrer) {
      try {
        cameFromThisSite = new URL(referrer).origin === window.location.origin
      } catch {
        cameFromThisSite = false
      }
    }

    if (cameFromThisSite && typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(fallbackHref)
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className}`}
      aria-label={label}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}
