'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, CircleHelp } from 'lucide-react'

export default function FrequentlyAskedQuestions({ audience = 'visitor' }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  const retry = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    let active = true

    const loadFaqs = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/info/api/faqs', { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load FAQs.')
        if (active) setItems(Array.isArray(result.items) ? result.items : [])
      } catch (loadError) {
        console.error('Public FAQ load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load FAQs right now.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadFaqs()
    return () => { active = false }
  }, [reloadKey])

  const isRegisteredUser = audience === 'user'

  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <CircleHelp className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Need a hand?</p>
          <h2 id="faq-heading" className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
            Frequently asked questions
          </h2>
        </div>
      </div>

      {loading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500" role="status">Loading answers...</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          <p>{error}</p>
          <button type="button" onClick={retry} className="mt-2 font-semibold underline">Try again</button>
        </div>
      ) : items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <details key={item.id} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-left font-bold text-slate-900 marker:hidden sm:p-5">
                <span>{item.question}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-600 whitespace-pre-line sm:px-5">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          There are no published answers yet. Please contact the tourism office if you need help.
        </p>
      )}

      <Link
        href={isRegisteredUser ? '/info/user/feedback' : '/info/contact'}
        className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-sky-700 hover:text-sky-900"
      >
        {isRegisteredUser ? 'Ask the tourism office' : 'Contact the tourism office'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
