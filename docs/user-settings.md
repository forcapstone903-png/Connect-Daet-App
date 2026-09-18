# User Settings (appearance, language, privacy)

The user-facing Settings surface lives at `/user/settings` and is made of one tab
per concern:

| Tab | What it controls | Where it is stored |
| --- | --- | --- |
| Appearance | Light / dark / system theme, reduce motion | Device (`localStorage`) + `profiles.ui_preferences` |
| Language | English, Filipino, Bikol | Device (`localStorage`) + `profiles.language_preference` |
| Notifications | Device push permission and notification category preferences | Existing push subscriptions + `profiles.notification_preferences` |
| Privacy | Public/private profile visibility and account privacy preferences | `profiles.privacy_level`, `profiles.is_public`, `profiles.privacy_preferences` |
| Account | Sign-in email, password reset link, profile edit, sign out everywhere, deactivation, and 30-day deletion requests | Supabase auth + `info_users` lifecycle fields |
| Data & storage | Storage usage, clear cached data, export settings, reset, install app | Device |
| About & legal | Privacy policy, terms, cookie policy, accessibility, developer information, feedback | Static routes |

## Deployment and limitations

Apply `supabase/migrations/050_user_settings_preferences.sql` for account appearance sync and `supabase/migrations/051_account_lifecycle.sql` for deactivation and deletion requests. The migrations have not been applied here. Older schemas receive a partial-save warning, and lifecycle actions require the new columns.

Language support covers settings and selected navigation labels, not the entire application or user-generated content; missing labels fall back to English. Notification category preferences are saved to the profile and are available to delivery paths as they are added. Privacy preferences are saved to the profile and are available to enforcement paths as they are added. Profile visibility uses existing rules and does not hide previously published posts. No 2FA enrollment is provided.

Display changes apply immediately. Reset restores device defaults and a draft; Save is required to update the account. Authenticated writes, email delivery, push prompts, and global sign-out still require testing with a signed-in account. Global dark utility remapping warrants visual review across routes.

Deactivation sets the `info_users` status to `suspended` and signs the user out; signing in again exposes a reactivation action. Deletion requests also suspend the account and store a deadline 30 days later. A trusted scheduled cleanup job must delete accounts whose `deletion_scheduled_for` has passed; the settings route only creates, cancels, and reports the request.


## Notification inbox behaviour (`/user/notifications`)

- Read state is per notification. Opening a notification, "Mark read", and "Mark all read" clear the unread flag; loading the page no longer marks the whole list read, so the New/Earlier split, unread dots, and the bell badge stay meaningful.
- The header bell badge uses the server's exact `unread_count` (from `GET /api/notifications`) instead of counting the loaded page, which is capped at 50 rows.
- Incoming notifications arrive over Supabase Realtime, play a short chime, and update the badge through the `daet-notifications-updated` window event consumed by `UserTopHeader`, `MobileNav`, and the dashboard.
- The chime is opt-in per device and stored at `daet:notification-sound` (`'on'` / `'off'`), a display-only preference that contains no personal data. It is a separate key from `daet:user-settings:v1` because it is scoped to the notification inbox, not to account settings.
- The notification list cache stays memory-only and user-scoped (`notifications:user:{userId}`, 30 s TTL) with invalidation after every read-state, delete, and follow-action write.

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

## Adding a language

1. Add the locale to `LANGUAGES` and a dictionary in `src/lib/i18n.js`.
2. Keep English as the source of truth; missing keys fall back automatically.
3. No change is needed in components: they call `t('some.key')` from
   `useUserSettings()`.