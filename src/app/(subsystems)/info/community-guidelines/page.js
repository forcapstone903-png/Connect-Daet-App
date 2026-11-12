'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

export default function CommunityGuidelinesPage() {
  const [content, setContent] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchGuidelines = useCallback(async () => {
    const response = await fetch('/info/api/community-guidelines', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Unable to load community guidelines.')
    }
    return result
  }, [])

  useEffect(() => {
    let active = true
    fetchGuidelines()
      .then((result) => {
        if (!active) return
        setContent(result.content)
        setUpdatedAt(result.updatedAt || '')
      })
      .catch((loadError) => {
        if (!active) return
        console.error('Public community guidelines load failed:', loadError)
        setError(loadError.message || 'Unable to load community guidelines.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [fetchGuidelines])

  const loadGuidelines = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchGuidelines()
      setContent(result.content)
      setUpdatedAt(result.updatedAt || '')
    } catch (loadError) {
      console.error('Public community guidelines load failed:', loadError)
      setError(loadError.message || 'Unable to load community guidelines.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/info" className="text-sm font-semibold text-sky-700 hover:underline">Back to DAET Connect</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Community</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">Community Guidelines</h1>
        {updatedAt ? <p className="mt-2 text-xs text-slate-500">Updated {new Date(updatedAt).toLocaleDateString()}</p> : null}
        {loading ? <p className="mt-8 text-sm text-slate-500">Loading guidelines...</p> : null}
        {error ? (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadGuidelines()} className="mt-2 font-semibold underline">Try again</button>
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="mt-8 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{content}</div>
        ) : null}
      </article>
    </main>
  )
}
