'use client'

import { useEffect, useState } from 'react'
import AdminShell from '@/app/(subsystems)/info/components/admin/AdminShell'
import AdminPanel from '@/app/(subsystems)/info/components/admin/AdminPanel'
import AdminButton from '@/app/(subsystems)/info/components/admin/AdminButton'

export default function CommunityGuidelinesEditorPage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    fetch('/info/api/admin/community-guidelines', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load guidelines.')
        if (active) setContent(result.content)
      })
      .catch((loadError) => {
        console.error('Community guidelines page load failed:', loadError)
        if (active) setError(loadError.message || 'Unable to load community guidelines.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const loadGuidelines = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/info/api/admin/community-guidelines', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load guidelines.')
      setContent(result.content)
    } catch (loadError) {
      console.error('Community guidelines page load failed:', loadError)
      setError(loadError.message || 'Unable to load community guidelines.')
    } finally {
      setLoading(false)
    }
  }

  const saveGuidelines = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/info/api/admin/community-guidelines', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save guidelines.')
      setContent(result.content)
      setMessage('Community guidelines saved.')
    } catch (saveError) {
      console.error('Community guidelines save failed:', saveError)
      setError(saveError.message || 'Unable to save community guidelines.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminShell
      roleLabel="Moderator"
      eyebrow="Community Safety"
      title="Community Guidelines"
      description="Edit the rules shown to community members."
      headerIcon="content"
      actions={(
        <AdminButton icon="save" onClick={() => void saveGuidelines()} disabled={loading || saving}>
          {saving ? 'Saving...' : 'Save guidelines'}
        </AdminButton>
      )}
    >
      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadGuidelines()} className="mt-2 font-semibold underline">Try again</button>
          </div>
        ) : null}
        {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{message}</p> : null}
        <AdminPanel title="Public guidelines" description="Changes are immediately visible on the public Community Guidelines page.">
          <label htmlFor="community-guidelines-content" className="mb-2 block text-sm font-semibold text-slate-700">
            Guidelines text
          </label>
          <textarea
            id="community-guidelines-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={loading || saving}
            maxLength={20000}
            rows={18}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm leading-6 text-slate-800 disabled:bg-slate-50"
            aria-describedby="guidelines-character-count"
          />
          <p id="guidelines-character-count" className="mt-2 text-xs text-slate-500">{content.length.toLocaleString()} / 20,000 characters</p>
        </AdminPanel>
      </div>
    </AdminShell>
  )
}
