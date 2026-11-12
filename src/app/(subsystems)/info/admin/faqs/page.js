'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'

const EMPTY_FORM = {
  id: '',
  question: '',
  answer: '',
  sort_order: 10,
  is_published: false,
}

async function readResult(response) {
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.message || 'The request could not be completed.')
  return result
}

function fetchFaqs() {
  return fetch('/info/api/admin/faqs', {
    credentials: 'same-origin',
    cache: 'no-store',
  }).then(readResult)
}

export default function FrequentlyAskedQuestionsAdminPage() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadFaqs = useCallback(async () => {
    try {
      const result = await fetchFaqs()
      setItems(Array.isArray(result.items) ? result.items : [])
      setError('')
    } catch (loadError) {
      console.error('FAQ manager load failed:', loadError)
      setError(loadError.message || 'Unable to load FAQs.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadInitialFaqs = async () => {
      try {
        const result = await fetchFaqs()
        if (active) {
          setItems(Array.isArray(result.items) ? result.items : [])
          setError('')
        }
      } catch (loadError) {
        console.error('FAQ manager load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load FAQs.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInitialFaqs()
    return () => { active = false }
  }, [])

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const saveFaq = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        ...form,
        sort_order: Number(form.sort_order),
      }
      const result = await readResult(await fetch('/info/api/admin/faqs', {
        method: form.id ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
      setForm(EMPTY_FORM)
      setMessage(form.id ? 'FAQ updated.' : 'FAQ created.')
      await loadFaqs()
      return result
    } catch (saveError) {
      console.error('FAQ save failed:', saveError)
      setError(saveError.message || 'Unable to save this FAQ.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const editFaq = (item) => {
    setForm({
      id: item.id,
      question: item.question,
      answer: item.answer,
      sort_order: item.sort_order,
      is_published: item.is_published,
    })
    setError('')
    setMessage('')
  }

  const deleteFaq = async (item) => {
    if (!window.confirm(`Delete "${item.question}"? This will remove it from both dashboards.`)) return
    setDeletingId(item.id)
    setError('')
    setMessage('')
    try {
      await readResult(await fetch('/info/api/admin/faqs', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      }))
      if (form.id === item.id) setForm(EMPTY_FORM)
      setMessage('FAQ deleted.')
      await loadFaqs()
    } catch (deleteError) {
      console.error('FAQ deletion failed:', deleteError)
      setError(deleteError.message || 'Unable to delete this FAQ.')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <AdminShell
      roleLabel="Staff"
      eyebrow="Public Information"
      title="Frequently asked questions"
      description="Create and maintain answers shown on the visitor and registered-user dashboards."
      headerIcon="feedback"
    >
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
        {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{message}</p> : null}

        <AdminPanel
          title={form.id ? 'Edit FAQ' : 'Add an FAQ'}
          description="Answers are plain text. Publish an FAQ to make it visible to visitors and users."
        >
          <form onSubmit={saveFaq} className="space-y-4">
            <div>
              <label htmlFor="faq-question" className="mb-1.5 block text-sm font-semibold text-slate-700">Question</label>
              <input
                id="faq-question"
                value={form.question}
                onChange={(event) => setField('question', event.target.value)}
                required
                maxLength={240}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div>
              <label htmlFor="faq-answer" className="mb-1.5 block text-sm font-semibold text-slate-700">Answer</label>
              <textarea
                id="faq-answer"
                value={form.answer}
                onChange={(event) => setField('answer', event.target.value)}
                required
                maxLength={5000}
                rows={5}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div>
                <label htmlFor="faq-sort-order" className="mb-1.5 block text-sm font-semibold text-slate-700">Display order</label>
                <input
                  id="faq-sort-order"
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={form.sort_order}
                  onChange={(event) => setField('sort_order', event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:w-40"
                />
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(event) => setField('is_published', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Published on dashboards
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : form.id ? 'Save changes' : 'Create FAQ'}
              </button>
              {form.id ? (
                <button type="button" onClick={() => setForm(EMPTY_FORM)} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </AdminPanel>

        <AdminPanel title={`All FAQs${items.length ? ` (${items.length})` : ''}`} description="Unpublished answers remain available here but are hidden from the public dashboards.">
          {loading ? (
            <p className="text-sm text-slate-500" role="status">Loading FAQs...</p>
          ) : items.length ? (
            <div className="space-y-3">
              {items.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">{item.question}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {item.is_published ? 'Published' : 'Draft'}
                        </span>
                        <span className="text-xs text-slate-500">Order {item.sort_order}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{item.answer}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => editFaq(item)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</button>
                      <button type="button" onClick={() => void deleteFaq(item)} disabled={deletingId === item.id} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">
                        {deletingId === item.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No FAQs have been added yet.</p>
          )}
        </AdminPanel>
      </div>
    </AdminShell>
  )
}
