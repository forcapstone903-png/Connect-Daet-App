'use client'

// Complete user Settings surface: notifications, language, account & security,
// privacy, device data, and legal links.
//
// Persistence model
// - Appearance, language, and reduced motion: device-local (versioned
//   localStorage envelope via UserSettingsProvider) and mirrored to
//   `profiles.ui_preferences` / `profiles.language_preference` on save.
// - Account preferences: loaded from and saved to the profiles row only.
//   Only display preferences enter the device-local envelope.
//
// Cache decision (docs/caching.md, docs/user-settings.md)
// - Reads: the signed-in user's own `profiles` row plus the device envelope.
// - A successful write invalidates `profile:user:{userId}` and
//   `feed:user:{userId}` because privacy/visibility changes affect what other
//   users may read.
// - Manual clear lives in Settings > Data & storage (clearLocalAppData) and the
//   reset action (resetUserSettings).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Check, ChevronRight, FileText, HardDrive, Languages, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import { useUserSettings } from '@/components/UserSettingsProvider'
import {
  clearLocalAppData,
  createDefaultSettings,
  getLocalStorageUsage,
  hasStoredThemePreference,
  invalidateSettingsCaches,
  mergeSettings,
  readStoredSettings,
  saveSettingsToProfile,
  settingsEqual,
  settingsFromProfileRow,
} from '@/lib/userSettings'
import { StatusBanner } from './_components/SettingsControls'
import LanguageSection from './_components/LanguageSection'
import NotificationsSection from './_components/NotificationsSection'
import PrivacySection from './_components/PrivacySection'
import SecuritySection from './_components/SecuritySection'
import DataStorageSection from './_components/DataStorageSection'
import LegalSection from './_components/LegalSection'

const TABS = [
  { id: 'privacy', titleKey: 'settings.nav.privacy', descriptionKey: 'settings.privacy.description', icon: LockKeyhole },
  { id: 'security', titleKey: 'settings.nav.security', descriptionKey: 'settings.security.description', icon: ShieldCheck },
  { id: 'notifications', titleKey: 'settings.nav.notifications', descriptionKey: 'settings.notifications.description', icon: Bell },
  { id: 'language', titleKey: 'settings.nav.language', descriptionKey: 'settings.language.description', icon: Languages },
  { id: 'data', titleKey: 'settings.nav.data', descriptionKey: 'settings.data.description', icon: HardDrive },
  { id: 'legal', titleKey: 'settings.nav.legal', descriptionKey: 'settings.legal.description', icon: FileText },
]

const SETTINGS_GROUPS = [
  { title: 'Profile', items: ['privacy', 'security'] },
  { title: 'Preferences', items: ['notifications', 'language', 'data'] },
  { title: 'Safety', items: ['legal'] },
]

function triggerDownload(filename, contents) {
  try {
    const blob = new Blob([contents], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error('Settings export failed:', error)
    return false
  }
}
export default function UserSettingsPage() {
  const router = useRouter()
  const { settings: deviceSettings, t, updateSettings, resetSettings } = useUserSettings()

  const [activeTab, setActiveTab] = useState(null)
  const [draftValue, setDraft] = useState(null)
  const draft = draftValue ?? deviceSettings
  const [savedValue, setSavedSnapshot] = useState(null)
  const savedSnapshot = savedValue ?? deviceSettings
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [profileIdentity, setProfileIdentity] = useState({ name: '', avatarUrl: '' })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [storageUsage, setStorageUsage] = useState({ bytes: 0, entries: 0 })
  const [cacheCleared, setCacheCleared] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [accountLifecycle, setAccountLifecycle] = useState(null)
  const [accountActionPending, setAccountActionPending] = useState(false)
  const [resetStatus, setResetStatus] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const noticeTimerRef = useRef(null)
  const tRef = useRef(t)

  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => () => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
  }, [])

  const isDirty = useMemo(() => !settingsEqual(draft, savedSnapshot), [draft, savedSnapshot])

  const loadSession = useCallback(async () => {
    try {
      // Authorization is the signed, HTTP-only `daet_secure_session` cookie that
      // the proxy already validated for this request. The Supabase JS session can
      // legitimately be empty (different browser / cleared storage) while the user
      // is still signed in, so fall back to the display cookie before bouncing.
      const storedSession = getStoredSessionObject()
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) console.warn('Settings session lookup warning:', error)
      const id = session?.user?.id || storedSession?.user_id || storedSession?.id || null
      if (!id) {
        router.replace('/info/login')
        return
      }
      setEmail(session?.user?.email || storedSession?.user_email || '')
      setProfileIdentity({
        name: session?.user?.user_metadata?.full_name
          || session?.user?.user_metadata?.name
          || storedSession?.user_name
          || storedSession?.full_name
          || session?.user?.email?.split('@')[0]
          || storedSession?.user_email?.split('@')[0]
          || '',
        avatarUrl: session?.user?.user_metadata?.avatar_url
          || storedSession?.avatar_url
          || storedSession?.profile_image_url
          || '',
      })
      const response = await fetch('/info/api/user/settings', { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || tRef.current('settings.status.loadFailed'))
      const localSettings = readStoredSettings()
      const profileSettings = settingsFromProfileRow(result.profile)
      const next = mergeSettings(localSettings, {
        ...profileSettings,
        ...(hasStoredThemePreference() ? { theme: localSettings.theme } : {}),
      })
      setDraft(next)
      setSavedSnapshot(next)
      setUserId(result.user_id || id)
      updateSettings({ theme: next.theme, language: next.language, reduceMotion: next.reduceMotion })
      const lifecycleResponse = await fetch('/info/api/account/lifecycle', { cache: 'no-store' })
      const lifecycleResult = await lifecycleResponse.json().catch(() => ({}))
      if (lifecycleResponse.ok && lifecycleResult.lifecycle) setAccountLifecycle(lifecycleResult.lifecycle)
    } catch (error) {
      console.error('Settings load failed:', error)
      setNotice({ tone: 'error', text: tRef.current('settings.status.loadFailed') })
    } finally {
      setStorageUsage(getLocalStorageUsage())
      setLoading(false)
    }
  }, [router, updateSettings])

  useEffect(() => {
    // Deferred so the effect itself does not trigger synchronous state updates
    // (same pattern used by EnableNotificationsButton).
    const timer = window.setTimeout(() => {
      void loadSession()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadSession])

  const applyDeviceSetting = useCallback((patch) => {
    // Language changes apply instantly on this device.
    setDraft((previous) => mergeSettings(previous ?? deviceSettings, patch))
    updateSettings(patch)
  }, [deviceSettings, updateSettings])

  const patchDraft = useCallback((patch) => {
    setDraft((previous) => mergeSettings(previous ?? deviceSettings, patch))
  }, [deviceSettings])

  const saveSettings = useCallback(async () => {
    setSaving(true)
    setNotice(null)

    try {
      if (!userId) {
        setNotice({ tone: 'warning', text: t('settings.status.notSignedIn') })
        return
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNotice({ tone: 'warning', text: t('settings.status.offline') })
        return
      }

      const result = await saveSettingsToProfile({ settings: draft })
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error?.message || t('settings.status.saveFailed') })
        return
      }

      updateSettings({ theme: draft.theme, language: draft.language, reduceMotion: draft.reduceMotion })
      invalidateSettingsCaches(userId)
      setSavedSnapshot(draft)
      window.dispatchEvent(new Event('daet-settings-updated'))

      const savedMessage = t('common.saved')
      setNotice({ tone: 'success', text: savedMessage })
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice((current) => current?.text === savedMessage ? null : current)
      }, 3000)
    } catch (error) {
      console.error('Settings save failed:', error)
      setNotice({ tone: 'error', text: t('settings.status.saveFailed') })
    } finally {
      setSaving(false)
    }
  }, [draft, t, updateSettings, userId])
  const handleClearCache = useCallback(() => {
    setClearingCache(true)
    const { removedKeys } = clearLocalAppData()
    setStorageUsage(getLocalStorageUsage())
    setCacheCleared(true)
    setClearingCache(false)
    if (removedKeys.length === 0) setNotice({ tone: 'info', text: t('settings.data.cleared') })
    return undefined
  }, [t])

  const handleDownloadSettings = useCallback(() => {
    const exported = {
      exported_at: new Date().toISOString(),
      app: 'CONNECT-Daet',
      settings: draft,
      privacy_level: draft.privacy.privacyLevel,
      language_preference: draft.language,
    }
    const downloaded = triggerDownload('connect-daet-settings.json', JSON.stringify(exported, null, 2))
    setNotice(downloaded
      ? { tone: 'success', text: t('settings.data.downloadHint') }
      : { tone: 'error', text: t('settings.status.saveFailed') })
  }, [draft, t])

  const handleResetSettings = useCallback(async () => {
    const defaults = createDefaultSettings()
    setResetPending(true)
    setNotice(null)
    try {
      if (!userId) throw new Error(t('settings.status.notSignedIn'))
      const result = await saveSettingsToProfile({ settings: defaults })
      if (!result.ok) throw result.error || new Error(t('settings.status.saveFailed'))

      resetSettings()
      updateSettings({ theme: defaults.theme, language: defaults.language, reduceMotion: defaults.reduceMotion })
      setDraft(defaults)
      setSavedSnapshot(defaults)
      invalidateSettingsCaches(userId)
      window.dispatchEvent(new Event('daet-settings-updated'))
      setConfirmAction(null)
      setNotice({ tone: 'success', text: t('common.reset') })
    } catch (error) {
      console.error('Settings reset failed:', error)
      setNotice({ tone: 'error', text: error.message || t('settings.status.saveFailed') })
    } finally {
      setResetPending(false)
    }
  }, [resetSettings, t, updateSettings, userId])

  const handlePasswordReset = useCallback(async () => {
    if (!email) return

    setResetStatus(t('common.saving'))
    try {
      const response = await fetch('/info/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const result = await response.json().catch(() => ({}))
      setResetStatus(response.ok
        ? t('settings.security.resetPasswordHint')
        : (result.error || result.message || t('settings.status.saveFailed')))
    } catch (error) {
      console.error('Password reset request failed:', error)
      setResetStatus(t('settings.status.saveFailed'))
    }
  }, [email, t])

  const handleSignOutAll = useCallback(async () => {
    setSignOutPending(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      if (error) throw error
    } catch (error) {
      console.error('Global sign-out failed:', error)
      setNotice({ tone: 'error', text: t('settings.status.signOutFailed') })
      setSignOutPending(false)
      setConfirmAction(null)
      return
    }

    await performLogout()
    window.location.assign('/info/login')
  }, [t])

  const handleAccountAction = useCallback(async (action) => {
    setAccountActionPending(true)
    setNotice(null)

    try {
      const response = await fetch('/info/api/account/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.message || t('settings.status.saveFailed'))

      setAccountLifecycle(result.lifecycle)
      setConfirmAction(null)

      if (action === 'deactivate' || action === 'schedule_deletion') {
        await performLogout()
        window.location.assign('/info/login')
        return
      }

      setNotice({ tone: 'success', text: action === 'reactivate' ? t('settings.security.reactivated') : t('settings.security.deletionCancelled') })
    } catch (error) {
      console.error('Account lifecycle action failed:', error)
      setNotice({ tone: 'error', text: error.message || t('settings.status.saveFailed') })
    } finally {
      setAccountActionPending(false)
    }
  }, [t])

  const handleNotificationChange = useCallback((key, value) => {
    patchDraft({ notifications: { [key]: value } })
  }, [patchDraft])

  const handlePrivacyChange = useCallback((key, value) => {
    patchDraft({ privacy: { [key]: value } })
  }, [patchDraft])

  const confirmTitle = confirmAction === 'reset'
    ? t('common.reset')
    : confirmAction === 'deactivate'
      ? t('settings.security.deactivate')
      : confirmAction === 'delete'
        ? t('settings.security.deleteAccount')
        : t('settings.security.signOutAll')
  const confirmMessage = confirmAction === 'reset'
    ? t('settings.data.resetHint')
    : confirmAction === 'deactivate'
      ? t('settings.security.deactivateConfirm')
      : confirmAction === 'delete'
        ? t('settings.security.deleteAccountConfirm')
        : t('settings.security.signOutAllHint')
  const confirmHandler = confirmAction === 'reset'
    ? handleResetSettings
    : confirmAction === 'deactivate'
      ? () => handleAccountAction('deactivate')
      : confirmAction === 'delete'
        ? () => handleAccountAction('schedule_deletion')
        : handleSignOutAll
  const activeSetting = TABS.find(({ id }) => id === activeTab)

  return (
    <main className="tourism-shell usr-section-page usr-settings min-h-screen w-full overflow-x-clip text-slate-900">
      <header className="settings-topbar">
        <button
          type="button"
          onClick={() => activeTab ? setActiveTab(null) : router.push('/info/user/dashboard')}
          aria-label={activeTab ? 'Back to settings' : 'Back to dashboard'}
          className="settings-back-button"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden="true" />
        </button>
        <h1>{t('settings.title')}</h1>
      </header>
      <div className="usr-section-container settings-container mx-auto w-full max-w-none px-0 pb-24 pt-0">
        {notice ? (
          <div className="settings-notice">
            <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>
          </div>
        ) : null}

        {!activeTab ? (
          <div className="settings-index">
            {profileIdentity.name ? (
              <Link href="/info/user/profile/edit" className="settings-profile-link">
                <span className="settings-profile-avatar">
                  {profileIdentity.avatarUrl
                    ? <Image src={profileIdentity.avatarUrl} alt="" width={60} height={60} unoptimized />
                    : <UserRound className="h-9 w-9" aria-hidden="true" />}
                </span>
                <span className="settings-profile-copy">
                  <strong>{profileIdentity.name}</strong>
                  <span>{email || t('settings.security.profile')}</span>
                </span>
                <ChevronRight className="settings-row-chevron h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}

            {SETTINGS_GROUPS.map((group) => (
              <section key={group.title} className="settings-group" aria-labelledby={`settings-group-${group.title}`}>
                <h2 id={`settings-group-${group.title}`}>{group.title}</h2>
                <div>
                  {group.items.map((id) => {
                    const item = TABS.find((setting) => setting.id === id)
                    if (!item) return null
                    const description = t(item.descriptionKey)

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        className="settings-index-row"
                        aria-label={`${t(item.titleKey)}. ${description}`}
                      >
                        <item.icon className="settings-row-icon" aria-hidden="true" />
                        <span className="settings-row-copy">
                          <strong>{t(item.titleKey)}</strong>
                          <span>{description}</span>
                        </span>
                        <ChevronRight className="settings-row-chevron h-5 w-5" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}

            {isDirty ? (
              <div className="settings-save-bar">
                <div className="flex items-center justify-between gap-3">
                  <p>{t('common.unsaved')}</p>
                  <button type="button" onClick={saveSettings} disabled={saving || loading || !userId} className="usr-section-primary">
                    <Check className="h-4 w-4" />
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <section className="settings-detail" aria-label={activeSetting ? t(activeSetting.titleKey) : t('settings.title')}>
            <fieldset disabled={loading || saving} className="settings-panels min-w-0">
              {activeTab === 'language' ? (
                <LanguageSection settings={draft} t={t} onLanguageChange={(language) => applyDeviceSetting({ language })} />
              ) : null}
              {activeTab === 'notifications' ? (
                <NotificationsSection settings={draft} t={t} userId={userId} onNotificationChange={handleNotificationChange} />
              ) : null}
              {activeTab === 'privacy' ? (
                <PrivacySection settings={draft} t={t} onPrivacyChange={handlePrivacyChange} />
              ) : null}
              {activeTab === 'security' ? (
                <SecuritySection
                  t={t}
                  email={email}
                  resetStatus={resetStatus}
                  signingOut={signOutPending}
                  accountLifecycle={accountLifecycle}
                  accountActionPending={accountActionPending}
                  onResetPassword={handlePasswordReset}
                  onDeactivate={() => setConfirmAction('deactivate')}
                  onReactivate={() => handleAccountAction('reactivate')}
                  onScheduleDeletion={() => setConfirmAction('delete')}
                  onCancelDeletion={() => handleAccountAction('cancel_deletion')}
                  onSignOutAll={() => {
                    setSignOutPending(true)
                    setConfirmAction('signout')
                  }}
                />
              ) : null}
              {activeTab === 'data' ? (
                <DataStorageSection
                  t={t}
                  storageUsage={storageUsage}
                  cacheCleared={cacheCleared}
                  clearingCache={clearingCache}
                  resetPending={resetPending}
                  onClearCache={handleClearCache}
                  onDownloadSettings={handleDownloadSettings}
                  onResetSettings={() => {
                    setResetPending(true)
                    setConfirmAction('reset')
                  }}
                />
              ) : null}
              {activeTab === 'legal' ? <LegalSection t={t} /> : null}

              <div className="settings-save-bar sticky bottom-0 z-20">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="min-w-0 flex-1 text-xs font-semibold text-slate-500">
                    {isDirty ? t('common.unsaved') : t('common.saved')}
                  </p>
                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={saving || loading || !userId}
                    className="usr-section-primary"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </fieldset>
          </section>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmAction !== null}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmAction === 'reset'
          ? t('common.reset')
          : confirmAction === 'deactivate'
            ? t('settings.security.deactivate')
            : confirmAction === 'delete'
              ? t('settings.security.deleteAccount')
              : t('settings.security.signOutAll')}
        cancelText={t('common.cancel')}
        isDangerous
        onConfirm={confirmHandler}
        onCancel={() => {
          setConfirmAction(null)
          setResetPending(false)
          setSignOutPending(false)
        }}
      />
    </main>
  )
}