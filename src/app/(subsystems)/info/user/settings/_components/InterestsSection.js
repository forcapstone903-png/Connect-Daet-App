'use client'

import { useEffect, useState } from 'react'
import { Save, Sparkles } from 'lucide-react'
import { notifyToast } from '@/lib/toast.mjs'
import { normalizeUserInterests } from '@/lib/userInterests'
import InterestSelector from '@/app/(subsystems)/info/components/user/InterestSelector'
import { PrimaryButton, SettingsCard, StatusBanner } from './SettingsControls'

export default function InterestsSection({ userId }) {
  const [savedInterests, setSavedInterests] = useState([])
  const [draftInterests, setDraftInterests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!userId) return undefined

    let active = true
    const loadInterests = async () => {
      setLoading(true)
      setLoadError('')
      try {
        const response = await fetch('/info/api/user/interests', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load your interests.')
        }

        if (active) {
          const interests = normalizeUserInterests(result.interests)
          setSavedInterests(interests)
          setDraftInterests(interests)
        }
      } catch (error) {
        if (active) {
          const message = error?.message || 'Unable to load your interests.'
          setLoadError(message)
          notifyToast(message, 'error')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadInterests()
    return () => { active = false }
  }, [userId, retry])

  const saveInterests = async () => {
    setSaving(true)
    try {
      const response = await fetch('/info/api/user/interests', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests: draftInterests }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to save your interests.')
      }

      const interests = normalizeUserInterests(result.interests)
      setSavedInterests(interests)
      setDraftInterests(interests)
      window.dispatchEvent(new CustomEvent('daet-user-interests-updated', { detail: { interests } }))
      notifyToast('Your interests were updated successfully.', 'success')
    } catch (error) {
      notifyToast(error?.message || 'Unable to save your interests.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      icon={Sparkles}
      title="Your interests"
      description="Choose what you enjoy to personalize stories, people, places, and event recommendations. You can leave this blank and come back anytime."
    >
      {loading ? (
        <p className="py-4 text-sm text-slate-500" role="status">Loading your saved interests...</p>
      ) : loadError ? (
        <div className="space-y-3">
          <StatusBanner tone="error">{loadError}</StatusBanner>
          <PrimaryButton tone="neutral" onClick={() => setRetry((value) => value + 1)}>Try again</PrimaryButton>
        </div>
      ) : (
        <>
          <InterestSelector
            selectedInterests={draftInterests}
            disabled={saving}
            onToggle={(interest) => setDraftInterests((current) => (
              current.includes(interest)
                ? current.filter((item) => item !== interest)
                : [...current, interest]
            ))}
          />
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">{draftInterests.length} selected</p>
          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <PrimaryButton
              tone="neutral"
              disabled={saving}
              onClick={() => setDraftInterests(savedInterests)}
            >
              Cancel
            </PrimaryButton>
            <PrimaryButton disabled={saving} onClick={saveInterests}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving...' : 'Save Changes'}
            </PrimaryButton>
          </div>
        </>
      )}
    </SettingsCard>
  )
}
