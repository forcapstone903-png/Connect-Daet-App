const test = require('node:test')
const assert = require('node:assert/strict')

async function loadSettings() {
  return import('./userSettings.js')
}

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    get length() {
      return map.size
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(key, String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

test('normalizeSettings coerces bad payloads into the canonical shape', async () => {
  const { normalizeSettings, DEFAULT_SETTINGS } = await loadSettings()

  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings('not-an-object'), DEFAULT_SETTINGS)

  const normalized = normalizeSettings({
    theme: 'neon',
    language: 'tl',
    reduceMotion: 'yes',
    notifications: { emailAlerts: false, bogus: true },
    privacy: { privacyLevel: 'secret', allowMessagesFrom: 'friends', showActivity: false },
  })

  assert.equal(normalized.theme, 'system')
  assert.equal(normalized.language, 'fil')
  assert.equal(normalized.reduceMotion, false)
  assert.equal(normalized.notifications.emailAlerts, false)
  assert.equal(normalized.notifications.forumMentions, true)
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.notifications, 'bogus'), false)
  assert.equal(normalized.privacy.privacyLevel, 'public')
  assert.equal(normalized.privacy.allowMessagesFrom, 'everyone')
  assert.equal(normalized.privacy.showActivity, false)
})

test('resolveThemeMode follows the mode and the system preference', async () => {
  const { resolveThemeMode } = await loadSettings()

  assert.equal(resolveThemeMode('dark', false), 'dark')
  assert.equal(resolveThemeMode('light', true), 'light')
  assert.equal(resolveThemeMode('system', true), 'dark')
  assert.equal(resolveThemeMode('system', false), 'light')
  assert.equal(resolveThemeMode(undefined, true), 'dark')
})
test('settings envelope round-trips and applies to the document root', async () => {
  const { applySettingsToDocument, readStoredSettings, writeStoredSettings, createDefaultSettings } = await loadSettings()
  const storage = createMemoryStorage()

  assert.deepEqual(readStoredSettings(storage), createDefaultSettings())

  const defaults = createDefaultSettings()
  const stored = {
    ...defaults,
    theme: 'dark',
    language: 'bik',
    reduceMotion: true,
    privacy: { ...defaults.privacy, privacyLevel: 'private' },
  }
  assert.equal(writeStoredSettings(stored, storage), true)

  const raw = JSON.parse(storage.getItem('daet:user-settings:v1'))
  assert.equal(raw.version, 1)
  assert.equal(typeof raw.cachedAt, 'number')

  const loaded = readStoredSettings(storage)
  assert.equal(loaded.theme, 'dark')
  assert.equal(loaded.language, 'bik')
  assert.equal(loaded.reduceMotion, true)
  assert.equal(loaded.privacy.privacyLevel, 'public')
  assert.deepEqual(Object.keys(raw.data).sort(), ['language', 'reduceMotion', 'theme'])

  const classes = new Set()
  const root = {
    classList: { toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name)) },
    dataset: {},
    attributes: {},
    getAttribute: () => null,
    setAttribute(name, value) {
      this.attributes[name] = value
    },
  }
  const fakeDocument = { documentElement: root, defaultView: { matchMedia: () => ({ matches: false }) } }
  const applied = applySettingsToDocument(loaded, fakeDocument)

  assert.equal(applied.resolvedTheme, 'dark')
  assert.equal(classes.has('dark'), true)
  assert.equal(root.dataset.theme, 'dark')
  assert.equal(root.dataset.themeMode, 'dark')
  assert.equal(root.dataset.reduceMotion, 'true')
  assert.equal(root.attributes.lang, 'bik')
})

test('corrupt or version-mismatched entries are dropped and replaced with defaults', async () => {
  const { readStoredSettings, createDefaultSettings } = await loadSettings()

  const corrupt = createMemoryStorage({ 'daet:user-settings:v1': '{ not json' })
  assert.deepEqual(readStoredSettings(corrupt), createDefaultSettings())
  assert.equal(corrupt.getItem('daet:user-settings:v1'), null)

  const outdated = createMemoryStorage({ 'daet:user-settings:v1': JSON.stringify({ version: 99, data: { theme: 'dark' } }) })
  assert.deepEqual(readStoredSettings(outdated), createDefaultSettings())
  assert.equal(outdated.getItem('daet:user-settings:v1'), null)
})
test('profile row maps to a settings patch and back into a payload', async () => {
  const { buildProfileSettingsPayload, mergeSettings, settingsFromProfileRow, createDefaultSettings } = await loadSettings()

  const patch = settingsFromProfileRow({
    language_preference: 'fil',
    notification_preferences: { newFollowers: false },
    privacy_level: 'private',
    privacy_preferences: { showOnlineStatus: false, allowMentions: false },
    ui_preferences: { theme: 'dark', reduceMotion: true },
  })

  const merged = mergeSettings(createDefaultSettings(), patch)
  assert.equal(merged.language, 'fil')
  assert.equal(merged.theme, 'dark')
  assert.equal(merged.reduceMotion, true)
  assert.equal(merged.notifications.newFollowers, false)
  assert.equal(merged.notifications.emailAlerts, true)
  assert.equal(merged.privacy.privacyLevel, 'private')
  assert.equal(merged.privacy.showOnlineStatus, false)

  const payload = buildProfileSettingsPayload('user-1', merged)
  assert.equal(payload.user_id, 'user-1')
  assert.equal(payload.privacy_level, 'private')
  assert.equal(payload.is_public, false)
  assert.equal(payload.language_preference, 'fil')
  assert.deepEqual(payload.privacy_preferences, merged.privacy)
  assert.deepEqual(payload.ui_preferences, { theme: 'dark', reduceMotion: true })
})

test('legacy notification mirror stays in sync and reset clears the cache family', async () => {
  const { readLegacyNotificationPreferences, writeLegacyNotificationPreferences, resetUserSettings, createDefaultSettings } = await loadSettings()
  const storage = createMemoryStorage({
    daet_user_profile_preferences: JSON.stringify({ notificationPrefs: { emailAlerts: false }, keepMe: true }),
  })

  writeLegacyNotificationPreferences({ emailAlerts: true, announcementAlerts: true }, storage)
  const legacy = readLegacyNotificationPreferences(storage)
  assert.equal(legacy.emailAlerts, true)
  assert.equal(legacy.announcementAlerts, true)
  assert.equal(legacy.forumMentions, true)
  assert.equal(JSON.parse(storage.getItem('daet_user_profile_preferences')).keepMe, true)

  storage.setItem('daet:user-settings:v1', JSON.stringify({ version: 1, cachedAt: 1, data: { theme: 'dark' } }))
  assert.deepEqual(resetUserSettings(storage), createDefaultSettings())
  assert.equal(storage.getItem('daet:user-settings:v1'), null)
  assert.equal(storage.getItem('daet_user_profile_preferences'), null)
})
test('saveSettingsToProfile retries without the settings columns on older databases', async () => {
  const { saveSettingsToProfile, createDefaultSettings } = await loadSettings()
  const defaults = createDefaultSettings()
  const settings = { ...defaults, theme: 'dark', privacy: { ...defaults.privacy, privacyLevel: 'private' } }

  const calls = []
  const client = {
    from: () => ({
      upsert: async (payload) => {
        calls.push(payload)
        if (calls.length === 1) return { data: null, error: { code: '42703', message: 'column "privacy_preferences" does not exist' } }
        return { data: payload, error: null }
      },
    }),
  }

  const result = await saveSettingsToProfile({ client, userId: 'user-9', settings })
  assert.equal(result.ok, true)
  assert.equal(result.partial, true)
  assert.equal(calls.length, 2)
  assert.equal(Object.prototype.hasOwnProperty.call(calls[1], 'privacy_preferences'), false)
  assert.equal(calls[1].privacy_level, 'private')

  const failing = await saveSettingsToProfile({
    client: { from: () => ({ upsert: async () => ({ data: null, error: { message: 'nope' } }) }) },
    userId: 'user-9',
    settings,
  })
  assert.equal(failing.ok, false)
  assert.equal(failing.partial, false)
})

test('translator returns localized labels and falls back to English', async () => {
  const { createTranslator } = await import('./i18n.js')

  assert.equal(createTranslator('en')('settings.privacy.title'), 'Privacy')
  assert.equal(createTranslator('fil')('settings.appearance.dark'), 'Madilim')
  assert.equal(createTranslator('bik')('settings.appearance.dark'), 'Madiklom')
  assert.equal(createTranslator('tl-PH')('settings.appearance.dark'), 'Madilim')
  assert.equal(createTranslator('nope')('settings.appearance.dark'), 'Dark')
  assert.equal(createTranslator('en')('settings.unknown.key', 'Fallback'), 'Fallback')
  assert.equal(createTranslator('en')('settings.unknown.key'), 'settings.unknown.key')
})