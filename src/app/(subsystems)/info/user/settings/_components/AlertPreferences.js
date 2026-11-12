'use client'

// Which alert categories this account receives (inbox + push on every device).
// Saved immediately per toggle; no row on the server means "all categories".

import { startTransition, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Siren } from 'lucide-react'

export default function AlertPreferences() {
  const [categories, setCategories] = useState([])
  const [selected, setSelected] = useState([])
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/info/api/alerts/preferences', { credentials: 'same-origin', cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load alert preferences.')
      setCategories(result.categories || [])
      setSelected(result.selected || [])
      setStatus('ready')
    } catch (error) {
      setMessage(error.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    startTransition(() => { void load() })
  }, [load])

  const save = async (next) => {
    const previous = selected
    setSelected(next)
    setStatus('saving')
    try {
      const response = await fetch('/info/api/alerts/preferences', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: next }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save.')
      setMessage(result.message)
      setStatus('ready')
    } catch (error) {
      setSelected(previous)
      setMessage(error.message)
      setStatus('ready')
    }
  }

  const toggle = (slug) => save(selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug])

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Siren className="h-4 w-4 text-red-600" aria-hidden="true" />
        Public alerts from the tourism office
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        Choose which alerts reach your inbox and devices. Alerts the office sends to everyone (such as evacuations) always reach you.
        {' '}<Link href="/info/visitor/alerts" className="font-semibold text-blue-700 hover:underline">See current alerts</Link>
      </p>

      {status === 'loading' ? (
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
      ) : status === 'error' ? (
        <p role="alert" className="mt-3 text-xs text-red-700">{message}</p>
      ) : (
        <fieldset className="mt-3" disabled={status === 'saving'}>
          <legend className="sr-only">Alert categories</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((category) => (
              <label key={category.slug} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected.includes(category.slug)}
                  onChange={() => toggle(category.slug)}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{category.name}</span>
                  {category.description ? <span className="block text-xs leading-4 text-slate-500">{category.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
          <p role="status" className="mt-2 min-h-4 text-xs text-slate-500">{status === 'saving' ? 'Saving…' : message}</p>
        </fieldset>
      )}
    </div>
  )
}
