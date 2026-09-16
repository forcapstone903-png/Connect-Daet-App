# User Settings (appearance, language, privacy)

The user-facing Settings surface lives at `/user/settings` and is made of one tab
per concern:

| Tab | What it controls | Where it is stored |
| --- | --- | --- |
| Appearance | Light / dark / system theme, reduce motion | Device (`localStorage`) + `profiles.ui_preferences` |
| Language | English, Filipino, Bikol | Device (`localStorage`) + `profiles.language_preference` |
| Notifications | Device push permission; category controls disabled until delivery integration exists | Existing push subscriptions |
| Privacy | Public/private profile visibility; additional switches disabled until enforcement exists | `profiles.privacy_level`, `profiles.is_public` |
| Account | Sign-in email, password reset link, profile edit, sign out everywhere | Supabase auth |
| Data & storage | Storage usage, clear cached data, export settings, reset, install app | Device |
| About & legal | Privacy policy, terms, cookie policy, accessibility, feedback | Static routes |

## Deployment and limitations

Apply `supabase/migrations/050_user_settings_preferences.sql` for account appearance sync. The migration has not been applied here. Older schemas receive a partial-save warning.

Language support covers settings and selected navigation labels, not the entire application or user-generated content; missing labels fall back to English. Additional privacy switches and notification categories are disabled until backend enforcement/delivery integration exists. Profile visibility uses existing rules and does not hide previously published posts. No 2FA enrollment is provided.

Display changes apply immediately. Reset restores device defaults and a draft; Save is required to update the account. Authenticated writes, email delivery, push prompts, and global sign-out still require testing with a signed-in account. Global dark utility remapping warrants visual review across routes.


## Implementation

- Model and storage: [`src/lib/userSettings.js`](../src/lib/userSettings.js)
- Pre-paint theme script: [`src/lib/themeBootstrap.js`](../src/lib/themeBootstrap.js)
- Global provider: [`src/components/UserSettingsProvider.js`](../src/components/UserSettingsProvider.js)
- Translations: [`src/lib/i18n.js`](../src/lib/i18n.js)
- Theme CSS: `src/app/globals.css` (`@custom-variant dark`, `html.dark` palette and
  neutral-surface remapping, `html[data-reduce-motion="true"]` rules)
- Schema: `supabase/migrations/050_user_settings_preferences.sql`

Dark mode is class-based (`html.dark`) so the user's explicit choice wins over the
OS preference. The root layout injects `THEME_BOOTSTRAP_SCRIPT` with
`next/script` `strategy="beforeInteractive"`, which applies the saved theme and
`lang` before the first paint.

Because most pages still use fixed light utility classes, the dark palette
remaps the neutral surfaces (`bg-white`, `bg-slate-50`, `text-slate-*`,
`border-*`, form controls, FullCalendar) in `globals.css`. New components should
keep using the light utility classes and rely on that remapping instead of
hand-writing `dark:` variants.

## Cache Decision Template

```text
Feature: User settings, appearance, language, and privacy preferences
Data fetched: profiles(privacy_level, is_public, language_preference, notification_preferences, privacy_preferences, ui_preferences)
Change frequency: only when the user saves, plus once per Settings visit (revalidation)
Visibility: Account preferences are user-specific; display preferences are non-sensitive and device-wide.
Freshness: Fresh profile read on every settings visit; account save requires successful load.
Stale behavior: Only display preferences render from device storage; failed account reads disable saving.
Missing-cache behavior: System theme and English until the profile loads.
Invalidation trigger: Successful save invalidates profile:user:{userId} and feed:user:{userId}.
Cache layer: Display-only localStorage; account preferences in component memory (no reusable read cache).
Cache key: daet:user-settings:v1 contains only theme, language, reduceMotion.
TTL: Display preferences persist until reset or version mismatch; account preferences fetched fresh on each visit.
Offline behavior: Display preferences work locally. Account writes are NOT queued; reconnect and press Save again.
Security notes: No tokens, passwords, email, privacy flags, or notification flags in the device envelope. Legacy mirror helpers remain for compatibility but are not read/written by the new settings page.
Manual clear method: Settings > Data & storage ("Clear cached data" -> clearLocalAppData, "Reset to defaults" -> resetUserSettings)
```

## Manual clear

- `clearLocalAppData()` clears the in-memory cache and every `daet:cache:*`
  localStorage entry. It never touches credentials, the auth session, or
  unrelated configuration.
- `resetUserSettings()` removes `daet:user-settings:v1` and the legacy
  `daet_user_profile_preferences` mirror, returning defaults.
- Logout keeps using `clearUserCache(userId)` from `src/lib/cache.js`.

## Tests

`src/lib/userSettings.test.js` (`node --test src/lib/userSettings.test.js`) covers:

- payload normalization (bad theme, language, and boolean values)
- theme resolution for light / dark / system
- envelope round-trip, version mismatch, and corrupt entry recovery
- profile row to settings mapping and back into the save payload
- legacy notification mirror sync and reset behaviour
- save retry when the new JSONB columns are missing (older database)
- translator fallbacks for `en`, `fil`, `bik`, and unknown locales

## Adding a language

1. Add the locale to `LANGUAGES` and a dictionary in `src/lib/i18n.js`.
2. Keep English as the source of truth; missing keys fall back automatically.
3. No change is needed in components: they call `t('some.key')` from
   `useUserSettings()`.