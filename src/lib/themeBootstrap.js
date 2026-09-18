// Device-level UI settings shared by the server layout, the client provider,
// and the pre-paint bootstrap script below.
//
// Cache decision (see docs/caching.md and docs/user-settings.md):
// - Layer: persistent browser storage (localStorage), device scoped.
// - Key: SETTINGS_STORAGE_KEY (versioned envelope: { version, cachedAt, data }).
// - Visibility: not sensitive. No tokens, email, or profile PII are stored here.
// - TTL: none (device preference). Version mismatch or corrupt payload resets to defaults.
// - Manual clear: clearStoredSettings() in src/lib/userSettings.js, exposed in Settings > Data & storage.

export const SETTINGS_STORAGE_KEY = 'daet:user-settings:v1'
export const SETTINGS_VERSION = 1

/**
 * Blocking inline script rendered from the root layout by `InlineScript`. It
 * runs synchronously while the HTML parses (before first paint) so dark mode
 * never flashes light. Keep it dependency-free and defensive: any failure must
 * fall back to light.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var raw = window.localStorage.getItem('${SETTINGS_STORAGE_KEY}');
    var payload = raw ? JSON.parse(raw) : null;
    var stored = payload && payload.version === ${SETTINGS_VERSION} && payload.data && typeof payload.data === 'object' ? payload.data : {};
    var mode = stored.theme === 'dark' || stored.theme === 'light' ? stored.theme : 'system';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    if (stored.reduceMotion === true) root.dataset.reduceMotion = 'true';
    if (typeof stored.language === 'string' && stored.language) root.lang = stored.language;
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.themeMode = 'system';
  }
})();`
