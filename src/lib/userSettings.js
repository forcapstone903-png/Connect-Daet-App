'use client'

// User-owned settings model: appearance (theme), language, accessibility,
// notifications, and privacy.
//
// Cache decision (docs/caching.md + docs/user-settings.md):
// Feature: User settings & appearance preferences
// Cache layer: versioned localStorage envelope for device display preferences
//   (`daet:user-settings:v1`), plus the existing user-scoped memory cache for
//   profile reads (`lib/cache.js`).
// Visibility: user-specific, not sensitive. No tokens, emails, or profile PII.
// Stale behavior: cached values render immediately, then revalidate from the
//   user's `profiles` row when the settings page loads.
// Invalidation: after a successful save; logout/account switch clears the
//   user-scoped memory cache. Manual clear: resetUserSettings() and
//   clearLocalAppData() below, both exposed in Settings > Data & storage.

import { clearAllCache, invalidateCachePrefix } from './cache.js'
import { createTranslator, normalizeLanguage } from './i18n.js'
import { SETTINGS_STORAGE_KEY, SETTINGS_VERSION } from './themeBootstrap.js'

export { SETTINGS_STORAGE_KEY, SETTINGS_VERSION }

// Legacy mirror written by the profile page. Kept in sync so notification
// preferences survive a reload on pages that still read this key.
export const LEGACY_PREFERENCES_KEY = 'daet_user_profile_preferences'

export const THEME_MODES = ['light', 'dark', 'system']

export const THEME_OPTIONS = [
  { value: 'light', labelKey: 'settings.appearance.light', hintKey: 'settings.appearance.lightHint' },
  { value: 'dark', labelKey: 'settings.appearance.dark', hintKey: 'settings.appearance.darkHint' },
  { value: 'system', labelKey: 'settings.appearance.system', hintKey: 'settings.appearance.systemHint' },
]

export const PRIVACY_LEVELS = ['public', 'private']

export const PRIVACY_LEVEL_OPTIONS = [
  { value: 'public', labelKey: 'settings.privacy.public', hintKey: 'settings.privacy.publicHint' },
  { value: 'private', labelKey: 'settings.privacy.private', hintKey: 'settings.privacy.privateHint' },
]

export const MESSAGE_PRIVACY_LEVELS = ['everyone', 'connections']

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  emailAlerts: true,
  activityDigest: true,
  newFollowers: true,
  forumMentions: true,
  announcementAlerts: false,
}

export const NOTIFICATION_OPTIONS = [
  { key: 'emailAlerts', labelKey: 'settings.notifications.emailAlerts' },
  { key: 'activityDigest', labelKey: 'settings.notifications.activityDigest' },
  { key: 'newFollowers', labelKey: 'settings.notifications.newFollowers' },
  { key: 'forumMentions', labelKey: 'settings.notifications.forumMentions' },
  { key: 'announcementAlerts', labelKey: 'settings.notifications.announcementAlerts' },
]

export const DEFAULT_PRIVACY_PREFERENCES = {
  privacyLevel: 'public',
  showOnlineStatus: true,
  showActivity: true,
  allowMessagesFrom: 'everyone',
  allowMentions: true,
  searchable: true,
}

export function createDefaultSettings() {
  return {
    theme: 'system',
    language: 'en',
    reduceMotion: false,
    notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    privacy: { ...DEFAULT_PRIVACY_PREFERENCES },
  }
}

export const DEFAULT_SETTINGS = createDefaultSettings()

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Coerces any stored/remote value into the canonical settings shape. Unknown
 * keys, wrong types, and missing keys fall back to defaults so a bad payload can
 * never break the settings UI.
 */
export function normalizeSettings(raw) {
  const value = isPlainObject(raw) ? raw : {}
  const notifications = isPlainObject(value.notifications) ? value.notifications : {}
  const privacy = isPlainObject(value.privacy) ? value.privacy : {}

  const normalizedNotifications = {}
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
    normalizedNotifications[key] = typeof notifications[key] === 'boolean'
      ? notifications[key]
      : DEFAULT_NOTIFICATION_PREFERENCES[key]
  }

  return {
    theme: THEME_MODES.includes(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
    language: normalizeLanguage(value.language),
    reduceMotion: value.reduceMotion === true,
    notifications: normalizedNotifications,
    privacy: {
      privacyLevel: PRIVACY_LEVELS.includes(privacy.privacyLevel) ? privacy.privacyLevel : DEFAULT_PRIVACY_PREFERENCES.privacyLevel,
      showOnlineStatus: typeof privacy.showOnlineStatus === 'boolean' ? privacy.showOnlineStatus : DEFAULT_PRIVACY_PREFERENCES.showOnlineStatus,
      showActivity: typeof privacy.showActivity === 'boolean' ? privacy.showActivity : DEFAULT_PRIVACY_PREFERENCES.showActivity,
      allowMessagesFrom: MESSAGE_PRIVACY_LEVELS.includes(privacy.allowMessagesFrom) ? privacy.allowMessagesFrom : DEFAULT_PRIVACY_PREFERENCES.allowMessagesFrom,
      allowMentions: typeof privacy.allowMentions === 'boolean' ? privacy.allowMentions : DEFAULT_PRIVACY_PREFERENCES.allowMentions,
      searchable: typeof privacy.searchable === 'boolean' ? privacy.searchable : DEFAULT_PRIVACY_PREFERENCES.searchable,
    },
  }
}

export function getSystemPrefersDark(win = typeof window !== 'undefined' ? window : null) {
  if (!win || typeof win.matchMedia !== 'function') return false
  try {
    return win.matchMedia('(prefers-color-scheme: dark)').matches === true
  } catch {
    return false
  }
}

/** Resolves the theme that should actually render for a given mode. */
export function resolveThemeMode(mode, prefersDark = false) {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return prefersDark ? 'dark' : 'light'
}

/**
 * Applies settings to the document root. Called by the provider on mount and on
 * every change; mirrors what `THEME_BOOTSTRAP_SCRIPT` does before first paint.
 */
export function applySettingsToDocument(settings, doc = typeof document !== 'undefined' ? document : null) {
  const normalized = normalizeSettings(settings)
  const resolved = resolveThemeMode(normalized.theme, getSystemPrefersDark(doc?.defaultView))

  if (!doc) return { ...normalized, resolvedTheme: resolved }

  const root = doc.documentElement
  if (root) {
    root.classList.toggle('dark', resolved === 'dark')
    root.dataset.theme = resolved
    root.dataset.themeMode = normalized.theme
    if (normalized.reduceMotion) root.dataset.reduceMotion = 'true'
    else delete root.dataset.reduceMotion
    if (root.getAttribute('lang') !== normalized.language) root.setAttribute('lang', normalized.language)
  }

  return { ...normalized, resolvedTheme: resolved }
}

function resolveStorage(storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Reads the versioned settings envelope. Corrupt, version-mismatched, or evicted
 * entries are removed and replaced with defaults (docs/caching.md).
 */
export function readStoredSettings(storage) {
  const store = resolveStorage(storage)
  if (!store) return createDefaultSettings()

  try {
    const raw = store.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return createDefaultSettings()

    const parsed = JSON.parse(raw)
    if (!isPlainObject(parsed) || parsed.version !== SETTINGS_VERSION) {
      store.removeItem(SETTINGS_STORAGE_KEY)
      return createDefaultSettings()
    }

    // Only non-sensitive device display preferences may persist across accounts.
    const { theme, language, reduceMotion } = normalizeSettings(parsed.data)
    return normalizeSettings({ theme, language, reduceMotion })
  } catch {
    try {
      store.removeItem(SETTINGS_STORAGE_KEY)
    } catch {
      // Private-mode storage failures fall back to defaults.
    }
    return createDefaultSettings()
  }
}

/**
 * Persists settings as a versioned envelope. Returns false when the browser
 * blocks storage (quota, private mode) so callers can keep the in-memory state.
 */
export function writeStoredSettings(settings, storage) {
  const store = resolveStorage(storage)
  if (!store) return false

  try {
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      version: SETTINGS_VERSION,
      cachedAt: Date.now(),
      data: (({ theme, language, reduceMotion }) => ({ theme, language, reduceMotion }))(normalizeSettings(settings)),
    }))
    return true
  } catch {
    return false
  }
}

export function readLegacyNotificationPreferences(storage) {
  const store = resolveStorage(storage)
  if (!store) return null

  try {
    const raw = store.getItem(LEGACY_PREFERENCES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const prefs = isPlainObject(parsed?.notificationPrefs) ? parsed.notificationPrefs : null
    return prefs ? { ...DEFAULT_NOTIFICATION_PREFERENCES, ...prefs } : null
  } catch {
    return null
  }
}

export function writeLegacyNotificationPreferences(notifications, storage) {
  const store = resolveStorage(storage)
  if (!store) return false

  try {
    const existing = (() => {
      try {
        return JSON.parse(store.getItem(LEGACY_PREFERENCES_KEY) || '{}') || {}
      } catch {
        return {}
      }
    })()

    store.setItem(LEGACY_PREFERENCES_KEY, JSON.stringify({
      ...existing,
      notificationPrefs: normalizeSettings({ notifications }).notifications,
    }))
    return true
  } catch {
    return false
  }
}
/**
 * Maps the canonical settings into the `profiles` row written on save. The
 * `privacy_preferences` / `ui_preferences` columns are added by migration
 * 050_user_settings_preferences.sql.
 */
export function buildProfileSettingsPayload(userId, settings) {
  const normalized = normalizeSettings(settings)

  return {
    user_id: userId,
    privacy_level: normalized.privacy.privacyLevel,
    is_public: normalized.privacy.privacyLevel !== 'private',
    language_preference: normalized.language,
    notification_preferences: normalized.notifications,
    privacy_preferences: normalized.privacy,
    ui_preferences: {
      theme: normalized.theme,
      reduceMotion: normalized.reduceMotion,
    },
    updated_at: new Date().toISOString(),
  }
}

/** Reads a `profiles` row (including partial/legacy columns) into a settings patch. */
export function settingsFromProfileRow(row) {
  const profile = isPlainObject(row) ? row : {}
  const patch = {}

  if (typeof profile.language_preference === 'string' && profile.language_preference) {
    patch.language = profile.language_preference
  }
  if (isPlainObject(profile.notification_preferences)) {
    patch.notifications = profile.notification_preferences
  }
  if (isPlainObject(profile.ui_preferences)) {
    if (THEME_MODES.includes(profile.ui_preferences.theme)) patch.theme = profile.ui_preferences.theme
    if (typeof profile.ui_preferences.reduceMotion === 'boolean') patch.reduceMotion = profile.ui_preferences.reduceMotion
  }

  const privacy = isPlainObject(profile.privacy_preferences) ? { ...profile.privacy_preferences } : {}
  if (PRIVACY_LEVELS.includes(profile.privacy_level)) privacy.privacyLevel = profile.privacy_level
  else if (profile.is_public === false) privacy.privacyLevel = 'private'
  else if (profile.is_public === true) privacy.privacyLevel = 'public'
  if (Object.keys(privacy).length) patch.privacy = privacy

  return patch
}

/** Deep-merges a settings patch over a base value, always returning a valid shape. */
export function mergeSettings(base, patch) {
  const current = normalizeSettings(base)
  const next = isPlainObject(patch) ? patch : {}

  return normalizeSettings({
    theme: next.theme ?? current.theme,
    language: next.language ?? current.language,
    reduceMotion: next.reduceMotion ?? current.reduceMotion,
    notifications: { ...current.notifications, ...(isPlainObject(next.notifications) ? next.notifications : {}) },
    privacy: { ...current.privacy, ...(isPlainObject(next.privacy) ? next.privacy : {}) },
  })
}

export function settingsEqual(a, b) {
  return JSON.stringify(normalizeSettings(a)) === JSON.stringify(normalizeSettings(b))
}

export function createSettingsTranslator(settings) {
  return createTranslator(normalizeSettings(settings).language)
}
/**
 * Saves settings to the signed-in user's profile row.
 *
 * Returns `{ ok, partial, error }`. `partial` means the base profile columns were
 * saved but the settings JSONB columns are missing on this database (migration
 * 050 not applied yet); the device copy is still authoritative.
 */
export async function saveSettingsToProfile({ client, userId, settings }) {
  if (!client || !userId) {
    return { ok: false, partial: false, error: new Error('Missing Supabase client or user id') }
  }

  const payload = buildProfileSettingsPayload(userId, settings)
  const fullSave = await client.from('profiles').upsert(payload, { onConflict: 'user_id' })
  if (!fullSave.error) return { ok: true, partial: false, error: null }
  if (!['42703', 'PGRST204'].includes(fullSave.error.code)) {
    return { ok: false, partial: false, error: fullSave.error }
  }

  const legacySave = await client.from('profiles').upsert({
    user_id: payload.user_id,
    privacy_level: payload.privacy_level,
    is_public: payload.is_public,
    language_preference: payload.language_preference,
    notification_preferences: payload.notification_preferences,
    updated_at: payload.updated_at,
  }, { onConflict: 'user_id' })

  if (legacySave.error) return { ok: false, partial: false, error: legacySave.error }
  return { ok: true, partial: true, error: fullSave.error }
}

/** Profile, feed, and notification caches must drop stale privacy/identity data. */
export function invalidateSettingsCaches(userId) {
  if (!userId) return
  invalidateCachePrefix(`profile:user:${userId}`)
  invalidateCachePrefix(`feed:user:${userId}`)
}

/**
 * Manual clear method for the settings cache family (docs/caching.md).
 * Removes the device preference envelope and the legacy notification mirror.
 */
export function resetUserSettings(storage) {
  const store = resolveStorage(storage)
  if (store) {
    try {
      store.removeItem(SETTINGS_STORAGE_KEY)
      store.removeItem(LEGACY_PREFERENCES_KEY)
    } catch {
      // Ignore storage failures; defaults are returned regardless.
    }
  }
  return createDefaultSettings()
}

/**
 * Clears app caches stored on this device: the user-scoped in-memory cache and
 * every persistent `daet:cache:*` entry. Never touches credentials, the auth
 * session, or unrelated application configuration.
 */
export function clearLocalAppData() {
  clearAllCache()

  const removedKeys = []
  if (typeof window !== 'undefined') {
    try {
      const store = window.localStorage
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index)
        if (key && key.startsWith('daet:cache:')) removedKeys.push(key)
      }
      removedKeys.forEach((key) => store.removeItem(key))
    } catch {
      // Storage failures must not block the reset action.
    }
  }

  return { removedKeys }
}

/** Approximate size of the device-local payload shown in Settings > Data & storage. */
export function getLocalStorageUsage() {
  if (typeof window === 'undefined') return { bytes: 0, entries: 0 }

  try {
    const store = window.localStorage
    let bytes = 0
    let entries = 0
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index)
      if (!key) continue
      entries += 1
      bytes += (key.length + (store.getItem(key) || '').length) * 2
    }
    return { bytes, entries }
  } catch {
    return { bytes: 0, entries: 0 }
  }
}