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
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Bell, Check, ChevronDown, ChevronLeft, CircleHelp, Eye, Languages, LockKeyhole, ShieldCheck, Sun, UserRound, UserRoundCog } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { useUserSettings } from '@/components/UserSettingsProvider'
import AccountManagementSection from './_components/AccountManagementSection'
import AppearanceSection from './_components/AppearanceSection'
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
import ProfileInformationSection from './_components/ProfileInformationSection'
import SecuritySection from './_components/SecuritySection'
import DataStorageSection from './_components/DataStorageSection'
import LegalSection from './_components/LegalSection'

const TABS = [
  { id: 'profile', label: 'Profile Information', description: 'Personal details and public profile', icon: UserRound },
  { id: 'security', label: 'Security & Authentication', description: 'Password, sign-ins, and sessions', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', description: 'In-app and device notification preferences', icon: Bell },
  { id: 'privacy-data', label: 'Privacy & Data', description: 'Profile visibility, data export, and storage', icon: Eye },
  { id: 'appearance', label: 'Appearance', description: 'Theme and motion preferences', icon: Sun },
  { id: 'language', label: 'Language & Region', description: 'Language and regional behavior', icon: Languages },
  { id: 'support', label: 'Help & Support', description: 'Legal information and support links', icon: CircleHelp },
  { id: 'account', label: 'Account Management', description: 'Deactivation and account deletion', icon: UserRoundCog },
]

export default function UserSettingsPage() {
  const router = useRouter()
  const { settings: deviceSettings, resolvedTheme, t, updateSettings, resetSettings } = useUserSettings()

  const [activeTab, setActiveTab] = useState('profile')
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false)
  const mobileCategoryButtonRef = useRef(null)
  const [draftValue, setDraft] = useState(null)
  const draft = draftValue ?? deviceSettings
  const [savedValue, setSavedSnapshot] = useState(null)
  const savedSnapshot = savedValue ?? deviceSettings
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [profileIdentity, setProfileIdentity] = useState({
    fullName: '',
    username: '',
    email: '',
    emailVerified: false,
    phoneNumber: '',
    avatarUrl: '',
    lastLoginAt: null,
  })
  const [profileError, setProfileError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [storageUsage, setStorageUsage] = useState({ bytes: 0, entries: 0 })
  const [cacheCleared, setCacheCleared] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [exportPending, setExportPending] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [signOutPending, setSignOutPending] = useState(false)
  const [accountLifecycle, setAccountLifecycle] = useState(null)
  const [accountActionPending, setAccountActionPending] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [deletionPassword, setDeletionPassword] = useState('')
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
        fullName: session?.user?.user_metadata?.full_name
          || session?.user?.user_metadata?.name
          || storedSession?.user_name
          || storedSession?.full_name
          || session?.user?.email?.split('@')[0]
          || storedSession?.user_email?.split('@')[0]
          || '',
        username: '',
        email: session?.user?.email || storedSession?.user_email || '',
        emailVerified: false,
        phoneNumber: '',
        avatarUrl: session?.user?.user_metadata?.avatar_url
          || storedSession?.avatar_url
          || storedSession?.profile_image_url
          || '',
        lastLoginAt: null,
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
      try {
        const profileResponse = await fetch('/info/api/profile', { cache: 'no-store' })
        const profileResult = await profileResponse.json().catch(() => ({}))
        if (!profileResponse.ok || !profileResult.success) {
          throw new Error(profileResult.message || 'Unable to load your profile information.')
        }
        setProfileIdentity(profileResult.profile)
        setEmail(profileResult.profile.email || session?.user?.email || '')
        setProfileError('')
      } catch (error) {
        setProfileError(error.message || 'Unable to load your profile information.')
      }
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

  const handleDownloadPersonalData = useCallback(() => {
    setExportPending(true)
    setNotice(null)
    void (async () => {
      try {
        const response = await fetch('/info/api/user/data-export', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!response.ok) {
          const result = await response.json().catch(() => ({}))
          throw new Error(result.message || 'Unable to download your data.')
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `daet-connect-data-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setNotice({ tone: 'success', text: 'Your personal data export has been downloaded.' })
      } catch (error) {
        setNotice({ tone: 'error', text: error.message || 'Unable to download your data.' })
      } finally {
        setExportPending(false)
      }
    })()
  }, [])

  const cancelSettingsChanges = useCallback(() => {
    setDraft(savedSnapshot)
    updateSettings({
      theme: savedSnapshot.theme,
      language: savedSnapshot.language,
      reduceMotion: savedSnapshot.reduceMotion,
    })
    setNotice({ tone: 'info', text: 'Unsaved preference changes were discarded.' })
  }, [savedSnapshot, updateSettings])

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

    const logoutResult = await performLogout()
    window.location.assign(logoutResult.sessionsRevoked
      ? '/info/login'
      : '/info/login?message=Signed%20out%20on%20this%20device%2C%20but%20other%20sessions%20could%20not%20be%20confirmed%20as%20revoked.')
  }, [t])

  const handleAccountAction = useCallback(async (action, password) => {
    if (action === 'schedule_deletion' && !password) {
      setNotice({ tone: 'error', text: 'Enter your current password to confirm account deletion.' })
      return
    }

    setAccountActionPending(true)
    setNotice(null)

    try {
      const response = await fetch('/info/api/account/lifecycle', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(password ? { password } : {}) }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) throw new Error(result.message || t('settings.status.saveFailed'))

      setAccountLifecycle(result.lifecycle)
      setConfirmAction(null)
      setDeletionPassword('')

      if (action === 'schedule_deletion') {
        await performLogout({ serverAlreadyRevoked: true })
        const recoveryParams = new URLSearchParams({
          scheduled: '1',
          emailNotificationSent: String(result.emailNotificationSent === true),
          deletionScheduledFor: result.lifecycle?.deletionScheduledFor || '',
        })
        window.location.assign(`/info/account-recovery?${recoveryParams.toString()}`)
        return
      }

      if (action === 'deactivate') {
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

  const handlePrivacyChange = useCallback((key, value) => {
    patchDraft({ privacy: { [key]: value } })
  }, [patchDraft])

  const handleNotificationChange = useCallback((key, value) => {
    patchDraft({ notifications: { [key]: value } })
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
        ? () => handleAccountAction('schedule_deletion', deletionPassword)
        : handleSignOutAll
  const activeSetting = TABS.find(({ id }) => id === activeTab) || TABS[0]

  return (
    <main className="tourism-shell usr-section-page usr-settings min-h-screen w-full overflow-x-clip text-slate-900">
      <UserTopHeader mobileOnly showMobileHeader={false} spacer={false} homeHref="/info/user/dashboard" />
      <header className="settings-topbar">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back()
            else router.push('/info/user/dashboard')
          }}
          aria-label="Go back"
          className="settings-back-button"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
        <h1>{t('settings.title')}</h1>
        <p>Manage your account and preferences</p>
      </header>
      <div className="usr-section-container settings-container mx-auto w-full max-w-none px-0 pb-24 pt-0">
        {notice ? (
          <div className="settings-notice">
            <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner>
          </div>
        ) : null}
        <div className="settings-layout">
          <aside className="settings-sidebar">
            <div className="settings-sidebar-profile">
              <span className="settings-profile-avatar">
                {profileIdentity.avatarUrl
                  ? <Image src={profileIdentity.avatarUrl} alt="" width={44} height={44} unoptimized />
                  : <UserRound className="h-7 w-7" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{profileIdentity.fullName || 'Your account'}</p>
                <p className="truncate text-xs text-slate-500">{email || ' '}</p>
              </div>
            </div>
            <nav aria-label="Settings categories" className="settings-sidebar-nav">
              {TABS.map(({ id, label, description, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={activeTab === id ? 'page' : undefined}
                  className="settings-sidebar-link"
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 text-left">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="settings-workspace settings-detail" aria-labelledby="settings-category-title">
            <div
              className="settings-mobile-select"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMobileCategoryOpen(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setMobileCategoryOpen(false)
                  mobileCategoryButtonRef.current?.focus()
                  event.preventDefault()
                  return
                }

                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  const options = [...event.currentTarget.querySelectorAll('.settings-mobile-category-option')]
                  const currentIndex = options.indexOf(document.activeElement)
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  const nextIndex = currentIndex < 0
                    ? (direction > 0 ? 0 : options.length - 1)
                    : (currentIndex + direction + options.length) % options.length
                  options[nextIndex]?.focus()
                  event.preventDefault()
                }
              }}
            >
              <label htmlFor="settings-category" className="settings-control-label">Settings category</label>
              <button
                ref={mobileCategoryButtonRef}
                id="settings-category"
                type="button"
                className="settings-mobile-category-trigger"
                aria-haspopup="menu"
                aria-expanded={mobileCategoryOpen}
                aria-controls="settings-category-menu"
                onClick={() => setMobileCategoryOpen((open) => !open)}
              >
                <span>{activeSetting.label}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${mobileCategoryOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {mobileCategoryOpen ? (
                <div id="settings-category-menu" className="settings-mobile-category-menu" role="menu" aria-label="Settings categories">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={activeTab === id}
                      className="settings-mobile-category-option"
                      onClick={() => {
                        setActiveTab(id)
                        setMobileCategoryOpen(false)
                        mobileCategoryButtonRef.current?.focus()
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <header className="settings-category-heading">
              <div className="settings-category-heading-icon"><activeSetting.icon className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <h2 id="settings-category-title">{activeSetting.label}</h2>
                <p>{activeSetting.description}</p>
              </div>
            </header>
            {profileError && activeTab === 'profile' ? (
              <div className="mb-4"><StatusBanner tone="error">{profileError}</StatusBanner></div>
            ) : null}
            <fieldset disabled={loading || saving} className="settings-panels min-w-0">
              {activeTab === 'profile' ? (
                <ProfileInformationSection profile={profileIdentity} email={email} />
              ) : null}
              {activeTab === 'security' ? (
                <SecuritySection
                  t={t}
                  signingOut={signOutPending}
                  onSignOutAll={() => {
                    setSignOutPending(true)
                    setConfirmAction('signout')
                  }}
                />
              ) : null}
              {activeTab === 'notifications' ? (
                <NotificationsSection
                  settings={draft}
                  t={t}
                  userId={userId}
                  onNotificationChange={handleNotificationChange}
                />
              ) : null}
              {activeTab === 'privacy-data' ? (
                <>
                  <PrivacySection settings={draft} t={t} onPrivacyChange={handlePrivacyChange} />
                  <DataStorageSection
                    t={t}
                    storageUsage={storageUsage}
                    cacheCleared={cacheCleared}
                    clearingCache={clearingCache}
                    resetPending={resetPending}
                    exportPending={exportPending}
                    onClearCache={handleClearCache}
                    onDownloadData={handleDownloadPersonalData}
                    onResetSettings={() => {
                      setResetPending(true)
                      setConfirmAction('reset')
                    }}
                  />
                </>
              ) : null}
              {activeTab === 'appearance' ? (
                <AppearanceSection
                  settings={draft}
                  t={t}
                  resolvedTheme={resolvedTheme}
                  onThemeChange={(theme) => applyDeviceSetting({ theme })}
                  onReduceMotionChange={(reduceMotion) => applyDeviceSetting({ reduceMotion })}
                />
              ) : null}
              {activeTab === 'language' ? (
                <LanguageSection settings={draft} t={t} onLanguageChange={(language) => applyDeviceSetting({ language })} />
              ) : null}
              {activeTab === 'support' ? <LegalSection t={t} /> : null}
              {activeTab === 'account' ? (
                <AccountManagementSection
                  t={t}
                  accountLifecycle={accountLifecycle}
                  accountActionPending={accountActionPending}
                  onDeactivate={() => setConfirmAction('deactivate')}
                  onReactivate={() => handleAccountAction('reactivate')}
                  onScheduleDeletion={() => setConfirmAction('delete')}
                />
              ) : null}
            </fieldset>
            {isDirty ? (
              <div className="settings-save-bar">
                <p>{t('common.unsaved')}</p>
                <div>
                  <button type="button" onClick={cancelSettingsChanges} disabled={saving || loading} className="settings-cancel-button">
                    {t('common.cancel')}
                  </button>
                  <button type="button" onClick={saveSettings} disabled={saving || loading || !userId} className="usr-section-primary">
                    <Check className="h-4 w-4" />
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <ConfirmationModal
        title={confirmTitle}
        message={confirmMessage}
        isOpen={confirmAction !== null}
        confirmText={confirmAction === 'reset'
          ? t('common.reset')
          : confirmAction === 'deactivate'
            ? t('settings.security.deactivate')
            : confirmAction === 'delete'
              ? t('settings.security.deleteAccount')
              : t('settings.security.signOutAll')}
        cancelText={t('common.cancel')}
        isDangerous
        confirmDisabled={accountActionPending || resetPending || signOutPending || (confirmAction === 'delete' && !deletionPassword.trim())}
        onConfirm={confirmHandler}
        onCancel={() => {
          setConfirmAction(null)
          setDeletionPassword('')
          setResetPending(false)
          setSignOutPending(false)
        }}
      >
        {confirmAction === 'delete' ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-amber-800">
              Your account will be scheduled for permanent deletion 30 days after this request. You can restore it during that period.
            </p>
            <label htmlFor="delete-account-password" className="block text-sm font-semibold text-slate-700">Current password</label>
            <input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={deletionPassword}
              onChange={(event) => setDeletionPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </div>
        ) : null}
      </ConfirmationModal>
    </main>
  )
}