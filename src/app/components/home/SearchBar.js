'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar() {
  const [q, setQ] = useState('')
  const router = useRouter()

  const submit = (e) => {
    e.preventDefault()
    if (!q.trim()) return
    router.push(`/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search attractions, events, blogs..." className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm" />
        <button className="rounded-xl bg-blue-600 px-4 py-3 text-sm text-white">Search</button>
      </div>
    </form>
  )
}
