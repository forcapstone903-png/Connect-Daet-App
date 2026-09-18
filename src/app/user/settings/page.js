'use client'

// Complete user Settings surface: appearance (light/dark/system + reduced
// motion), language (English / Filipino / Bikol), notifications, privacy,
// account & security, device data, and legal links.
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
import { useRouter } from 'next/navigation'
import { Bell, Check, HardDrive, Info, Languages, Lock, Save, ShieldCheck, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/components/ConfirmationModal'
import { useUserSettings } from '@/components/UserSettingsProvider'
import {
  clearLocalAppData,
  createDefaultSettings,
  getLocalStorageUsage,
  invalidateSettingsCaches,
  mergeSettings,
  readStoredSettings,
  saveSettingsToProfile,
  settingsEqual,
  settingsFromProfileRow,
} from '@/lib/userSettings'
import { StatusBanner } from './_components/SettingsControls'
import UserSectionHeader from '@/app/components/user/UserSectionHeader'
import UserTopHeader from '@/app/components/user/UserTopHeader'
import AppearanceSection from './_components/AppearanceSection'
import LanguageSection from './_components/LanguageSection'
import NotificationsSection from './_components/NotificationsSection'
import PrivacySection from './_components/PrivacySection'
import SecuritySection from './_components/SecuritySection'
import DataStorageSection from './_components/DataStorageSection'
import LegalSection from './_components/LegalSection'

const TABS = [
  { id: 'appearance', labelKey: 'settings.nav.appearance', icon: Sun },
  { id: 'language', labelKey: 'settings.nav.language', icon: Languages },
  { id: 'notifications', labelKey: 'settings.nav.notifications', icon: Bell },
  { id: 'privacy', labelKey: 'settings.nav.privacy', icon: Lock },
  { id: 'security', labelKey: 'settings.nav.security', icon: ShieldCheck },
  { id: 'data', labelKey: 'settings.nav.data', icon: HardDrive },
  { id: 'legal', labelKey: 'settings.nav.legal', icon: Info },
]

const PROFILE_SETTINGS_COLUMNS = 'privacy_level, is_public, language_preference, notification_preferences, privacy_preferences, ui_preferences'
const PROFILE_LEGACY_COLUMNS = 'privacy_level, is_public, language_preference, notification_preferences'

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
  const { settings: deviceSettings, resolvedTheme, t, updateSettings, resetSettings } = useUserSettings()

  const [activeTab, setActiveTab] = useState('appearance')
  const [draftValue, setDraft] = useState(null)
  const draft = draftValue ?? deviceSettings
  const [savedValue, setSavedSnapshot] = useState(null)
  const savedSnapshot = savedValue ?? deviceSettings
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
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
        router.replace('/login')
        return
      }
      setEmail(session?.user?.email || storedSession?.user_email || '')
      let result = await supabase.from('profiles').select(PROFILE_SETTINGS_COLUMNS).eq('user_id', id).maybeSingle()
      if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
        result = await supabase.from('profiles').select(PROFILE_LEGACY_COLUMNS).eq('user_id', id).maybeSingle()
      }
      // A signed-in user without a Supabase JS session cannot read the row
      // (RLS filters it out). Fall back to device-local settings instead of
      // failing the whole page.
      const permissionDenied = result.error && ['42501', 'PGRST301'].includes(result.error.code)
      if (result.error && !permissionDenied) throw result.error
      const next = mergeSettings(readStoredSettings(), settingsFromProfileRow(result.data))
      setDraft(next)
      setSavedSnapshot(next)
      setUserId(id)
      updateSettings({ theme: next.theme, language: next.language, reduceMotion: next.reduceMotion })
      const lifecycleResponse = await fetch('/api/account/lifecycle', { cache: 'no-store' })
      const lifecycleResult = await lifecycleResponse.json().catch(() => ({}))
      if (lifecycleResponse.ok && lifecycleResult.lifecycle) setAccountLifecycle(lifecycleResult.lifecycle)
    } catch (error) {
      console.error('Settings load failed:', error)
      setNotice({ tone: 'error', text: t('settings.status.loadFailed') })
    } finally {
      setStorageUsage(getLocalStorageUsage())
      setLoading(false)
    }
  }, [router, t, updateSettings])

  useEffect(() => {
    // Deferred so the effect itself does not trigger synchronous state updates
    // (same pattern used by EnableNotificationsButton).
    const timer = window.setTimeout(() => {
      void loadSession()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadSession])

  const applyDeviceSetting = useCallback((patch) => {
    // Appearance, language, and motion apply instantly on this device.
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
      // Always keep the device copy in sync with what is on screen.
      updateSettings({ theme: draft.theme, language: draft.language, reduceMotion: draft.reduceMotion })

      if (!userId) {
        setNotice({ tone: 'warning', text: t('settings.status.notSignedIn') })
        setSavedSnapshot(draft)
        return
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setNotice({ tone: 'warning', text: t('settings.status.offline') })
        return
      }

      const result = await saveSettingsToProfile({ client: supabase, userId, settings: draft })
      if (!result.ok) {
        setNotice({ tone: 'error', text: t('settings.status.saveFailed') })
        return
      }

      invalidateSettingsCaches(userId)
      if (!result.partial) setSavedSnapshot(draft)
      window.dispatchEvent(new Event('daet-settings-updated'))

      if (result.partial) setNotice({ tone: 'warning', text: t('settings.status.saveFailed') })
      else {
        const savedMessage = t('common.saved')
        setNotice({ tone: 'success', text: savedMessage })
        if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current)
        noticeTimerRef.current = window.setTimeout(() => {
          setNotice((current) => current?.text === savedMessage ? null : current)
        }, 3000)
      }
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

  const handleResetSettings = useCallback(() => {
    const defaults = createDefaultSettings()
    resetSettings()
    setDraft(defaults)
    setConfirmAction(null)
    setResetPending(false)
    setNotice({ tone: 'info', text: t('common.reset') })
  }, [resetSettings, t])

  const handlePasswordReset = useCallback(async () => {
    if (!email) return

    setResetStatus(t('common.saving'))
    try {
      const response = await fetch('/api/forgot-password', {
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
    window.location.assign('/login')
  }, [t])

  const handleAccountAction = useCallback(async (action) => {
    setAccountActionPending(true)
    setNotice(null)

    try {
      const response = await fetch('/api/account/lifecycle', {
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
        window.location.assign('/login')
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
  return (
    <main className="tourism-shell usr-section-page usr-settings min-h-screen w-full overflow-x-clip text-slate-900">
      <UserTopHeader />
      <div className="usr-section-container mx-auto w-full max-w-6xl px-3 pb-28 pt-2 sm:px-4 lg:px-6 lg:pb-16">
        <UserSectionHeader
          eyebrow={t('settings.nav.security')}
          title={t('settings.title')}
          description={t('settings.subtitle')}
          emoji="⚙️"
        >
          <span className="usr-section-counter">{isDirty ? t('common.unsaved') : t('common.saved')}</span>
        </UserSectionHeader>

        {notice ? (
          <div className="mb-4">
            <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>
          </div>
        ) : null}

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
          <nav aria-label={t('settings.title')} className="lg:sticky lg:top-24 lg:self-start">
            <div role="tablist" aria-orientation="vertical" className="usr-card mb-4 flex gap-1.5 overflow-x-auto rounded-3xl p-2 lg:mb-0 lg:flex-col">
              {TABS.map(({ id, labelKey, icon: Icon }) => {
                const isActive = activeTab === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${id}`}
                    aria-selected={isActive}
                    aria-controls={`settings-panel-${id}`}
                    onClick={() => setActiveTab(id)}
                    className="usr-section-tab usr-press lg:w-full lg:justify-start"
                  >
                    <Icon className="h-4 w-4" />
                    {t(labelKey)}
                  </button>
                )
              })}
            </div>
          </nav>

          <fieldset disabled={loading || saving} className="min-w-0 space-y-4">
            <div role="tabpanel" id="settings-panel-appearance" aria-labelledby="settings-tab-appearance" hidden={activeTab !== 'appearance'}>
              <AppearanceSection
                settings={draft}
                t={t}
                resolvedTheme={resolvedTheme}
                onThemeChange={(theme) => applyDeviceSetting({ theme })}
                onReduceMotionChange={(reduceMotion) => applyDeviceSetting({ reduceMotion })}
              />
            </div>

            <div role="tabpanel" id="settings-panel-language" aria-labelledby="settings-tab-language" hidden={activeTab !== 'language'}>
              <LanguageSection
                settings={draft}
                t={t}
                onLanguageChange={(language) => applyDeviceSetting({ language })}
              />
            </div>

            <div role="tabpanel" id="settings-panel-notifications" aria-labelledby="settings-tab-notifications" hidden={activeTab !== 'notifications'}>
              <NotificationsSection
                settings={draft}
                t={t}
                userId={userId}
                onNotificationChange={handleNotificationChange}
              />
            </div>
            <div role="tabpanel" id="settings-panel-privacy" aria-labelledby="settings-tab-privacy" hidden={activeTab !== 'privacy'}>
              <PrivacySection settings={draft} t={t} onPrivacyChange={handlePrivacyChange} />
            </div>

            <div role="tabpanel" id="settings-panel-security" aria-labelledby="settings-tab-security" hidden={activeTab !== 'security'}>
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
            </div>

            <div role="tabpanel" id="settings-panel-data" aria-labelledby="settings-tab-data" hidden={activeTab !== 'data'}>
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
            </div>

            <div role="tabpanel" id="settings-panel-legal" aria-labelledby="settings-tab-legal" hidden={activeTab !== 'legal'}>
              <LegalSection t={t} />
            </div>

            <div className="usr-card sticky bottom-4 z-20 p-3 backdrop-blur-xl">
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
        </div>
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