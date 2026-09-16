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
//   Unsupported privacy and notification-category controls remain disabled.
//   Only display preferences enter the device-local envelope.
//
// Cache decision (docs/caching.md, docs/user-settings.md)
// - Reads: the signed-in user's own `profiles` row plus the device envelope.
// - A successful write invalidates `profile:user:{userId}` and
//   `feed:user:{userId}` because privacy/visibility changes affect what other
//   users may read.
// - Manual clear lives in Settings > Data & storage (clearLocalAppData) and the
//   reset action (resetUserSettings).

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Check, HardDrive, Info, Languages, Lock, Save, ShieldCheck, Sun } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  const [resetStatus, setResetStatus] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)

  const isDirty = useMemo(() => !settingsEqual(draft, savedSnapshot), [draft, savedSnapshot])

  const loadSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      const id = session?.user?.id
      if (!id) {
        router.replace('/login')
        return
      }
      setEmail(session.user.email || '')
      let result = await supabase.from('profiles').select(PROFILE_SETTINGS_COLUMNS).eq('user_id', id).maybeSingle()
      if (result.error && ['42703', 'PGRST204'].includes(result.error.code)) {
        result = await supabase.from('profiles').select(PROFILE_LEGACY_COLUMNS).eq('user_id', id).maybeSingle()
      }
      if (result.error) throw result.error
      const next = mergeSettings(readStoredSettings(), settingsFromProfileRow(result.data))
      setDraft(next)
      setSavedSnapshot(next)
      setUserId(id)
      updateSettings({ theme: next.theme, language: next.language, reduceMotion: next.reduceMotion })
    } catch (error) {
      console.error('Settings load failed:', error)
      setNotice({ tone: 'error', text: 'Account settings could not be loaded. Reload before saving account changes.' })
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
      else setNotice({ tone: 'success', text: t('common.saved') })
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

  const handleNotificationChange = useCallback((key, value) => {
    patchDraft({ notifications: { [key]: value } })
  }, [patchDraft])

  const handlePrivacyChange = useCallback((key, value) => {
    patchDraft({ privacy: { [key]: value } })
  }, [patchDraft])

  const confirmTitle = confirmAction === 'reset' ? t('common.reset') : t('settings.security.signOutAll')
  const confirmMessage = confirmAction === 'reset'
    ? t('settings.data.resetHint')
    : t('settings.security.signOutAllHint')
  return (
    <main className="min-h-screen w-full overflow-x-clip bg-[radial-gradient(circle_at_top,_#ecfeff_0%,_#f8fafc_30%,_#f1f5f9_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[1040px] px-3 pb-28 pt-0 sm:px-5 sm:pt-3 lg:px-8 lg:pb-16">
        <header className="sticky top-0 z-30 mb-4 rounded-[22px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:top-2 sm:p-4">
          <div className="flex items-center gap-3">
            <Link href="/user/profile" aria-label={t('settings.title')} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">{t('settings.nav.security')}</p>
              <h1 className="text-lg font-black text-slate-900">{t('settings.title')}</h1>
              <p className="truncate text-xs text-slate-500">{t('settings.subtitle')}</p>
            </div>
            <span className="ml-auto hidden shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 sm:block">
              {isDirty ? t('common.unsaved') : t('common.saved')}
            </span>
          </div>
        </header>

        {notice ? (
          <div className="mb-4">
            <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>
          </div>
        ) : null}

        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
          <nav aria-label={t('settings.title')} className="lg:sticky lg:top-24 lg:self-start">
            <div role="tablist" aria-orientation="vertical" className="-mx-3 mb-4 flex gap-1.5 overflow-x-auto px-3 pb-1 lg:mx-0 lg:mb-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
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
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-bold transition lg:w-full lg:justify-start lg:rounded-xl ${isActive ? 'border-sky-500 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
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
                onResetPassword={handlePasswordReset}
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

            <div className="sticky bottom-4 z-20 rounded-[18px] border border-slate-200 bg-white/95 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-xs font-semibold text-slate-500">
                  {isDirty ? t('common.unsaved') : t('common.saved')}
                </p>
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || loading || !userId}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
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
        confirmText={confirmAction === 'reset' ? t('common.reset') : t('settings.security.signOutAll')}
        cancelText={t('common.cancel')}
        isDangerous
        onConfirm={confirmAction === 'reset' ? handleResetSettings : handleSignOutAll}
        onCancel={() => {
          setConfirmAction(null)
          setResetPending(false)
          setSignOutPending(false)
        }}
      />
    </main>
  )
}