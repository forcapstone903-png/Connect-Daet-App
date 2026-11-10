'use client'

import { Lock } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChoiceCards, SelectField, SettingsCard, StatusBanner, ToggleRow } from './SettingsControls'
import { MESSAGE_PRIVACY_LEVELS, PRIVACY_LEVEL_OPTIONS } from '@/lib/userSettings'

export default function PrivacySection({ settings, t, onPrivacyChange }) {
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestError, setRequestError] = useState('')
  const [updatingRequester, setUpdatingRequester] = useState(null)

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    try {
      const response = await fetch('/info/api/user/follow-requests', { credentials: 'same-origin' })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load follow requests.')
      setRequests(result.requests || [])
      setRequestError('')
    } catch (error) {
      console.error('Follow request list load failed:', error)
      setRequests([])
      setRequestError(error.message || 'Unable to load follow requests.')
    } finally {
      setRequestsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRequests])

  const updateRequest = async (requesterId, action) => {
    setUpdatingRequester(requesterId)
    try {
      const response = await fetch('/info/api/user/follow-requests', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId, action }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to update this follow request.')
      setRequests((current) => current.filter((item) => item.follower_id !== requesterId))
    } catch (error) {
      console.error('Follow request update failed:', error)
      setRequestError(error.message || 'Unable to update this follow request.')
    } finally {
      setUpdatingRequester(null)
    }
  }

  const messageOptions = [
    { value: 'everyone', label: t('settings.privacy.everyone') },
    { value: 'connections', label: t('settings.privacy.connections') },
  ]

  return (
    <SettingsCard
      icon={Lock}
      title={t('settings.privacy.title')}
      description={t('settings.privacy.description')}
    >
      <div>
        <p className="text-sm font-semibold text-slate-800">{t('settings.privacy.profileVisibility')}</p>
        <div className="mt-2">
          <ChoiceCards
            name={t('settings.privacy.profileVisibility')}
            options={PRIVACY_LEVEL_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
              hint: t(option.hintKey),
            }))}
            value={settings.privacy.privacyLevel}
            onChange={(value) => onPrivacyChange('privacyLevel', value)}
            columns={3}
          />
        </div>
      </div>

      <SelectField
        id="settings-message-privacy"
        label={t('settings.privacy.allowMessagesFrom')}
        value={settings.privacy.allowMessagesFrom}
        onChange={(value) => onPrivacyChange('allowMessagesFrom', value)}
        options={messageOptions.filter((option) => MESSAGE_PRIVACY_LEVELS.includes(option.value))}
      />

      <ToggleRow
        id="settings-privacy-searchable"
        label={t('settings.privacy.searchable')}
        hint={t('settings.privacy.searchableHint')}
        checked={settings.privacy.searchable}
        onChange={(next) => onPrivacyChange('searchable', next)}
      />

      <ToggleRow
        id="settings-auto-approve-follow-requests"
        label="Automatically approve follow requests"
        hint="When on, people can follow you immediately. When off, approve requests below before they can see your private posts and reposts."
        checked={settings.privacy.autoApproveFollowRequests}
        onChange={(next) => onPrivacyChange('autoApproveFollowRequests', next)}
      />

      <div className="settings-control-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="settings-control-label">Pending follow requests</p>
            <p className="settings-control-hint">Only approved followers can view a private account&apos;s shared content.</p>
          </div>
          <button type="button" className="settings-control-label" onClick={() => void loadRequests()}>
            Refresh
          </button>
        </div>
        {requestError ? <StatusBanner tone="error">{requestError}</StatusBanner> : null}
        {requestsLoading ? (
          <p className="mt-3 text-sm text-slate-500">Loading follow requests…</p>
        ) : requests.length ? (
          <ul className="mt-3 divide-y divide-slate-200">
            {requests.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {item.requester.profile_image_url ? (
                    <img src={item.requester.profile_image_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                      {(item.requester.full_name || 'U').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <Link href={`/info/user/profile/${item.follower_id}`} className="truncate text-sm font-semibold text-slate-800 hover:text-teal-700">
                    {item.requester.full_name}
                  </Link>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="usr-section-primary"
                    disabled={updatingRequester === item.follower_id}
                    onClick={() => void updateRequest(item.follower_id, 'approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="usr-section-secondary"
                    disabled={updatingRequester === item.follower_id}
                    onClick={() => void updateRequest(item.follower_id, 'reject')}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : !requestError ? (
          <p className="mt-3 text-sm text-slate-500">No pending follow requests.</p>
        ) : null}
      </div>
    </SettingsCard>
  )
}