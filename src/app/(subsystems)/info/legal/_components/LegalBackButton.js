'use client'

import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function LegalBackButton() {
  const router = useRouter()

  const goBack = () => {
    const referrer = document.referrer
    const cameFromThisSite = referrer && new URL(referrer).origin === window.location.origin

    if (cameFromThisSite && window.history.length > 1) {
      router.back()
      return
    }

    router.push('/info/visitor')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      aria-label="Go back"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  )
}
