# User Settings

The user-facing Settings surface lives at `/info/user/settings`. Desktop uses a
category sidebar; smaller screens use a compact category selector.

| Category | What it controls | Where it is stored |
| --- | --- | --- |
| Profile Information | Full name, username, email and phone status, profile photo; links to profile editing | `info_users` and `profiles` |
| Security & Authentication | Password change/recovery, recent sign-ins, global sign-out | Supabase Auth and `user_activity_log` |
| Notifications | Supported in-app notification filters and browser push | `profiles.notification_preferences` and push subscriptions |
| Privacy & Data | Profile/search/message privacy, private personal-data export, local storage controls | `profiles` and authenticated API export |
| Appearance | Light / dark / system theme, reduce motion | Device (`localStorage`) + `profiles.ui_preferences` mirror; saved device preferences take precedence |
| Language & Region | English, Filipino, Bikol; regional date formatting follows the device | Device (`localStorage`) + `profiles.language_preference` |
| Help & Support | Legal and support information | Static routes |
| Account Management | Temporary deactivation, 30-day deletion request and recovery | `info_users` lifecycle fields |

## Deployment and limitations

Apply `supabase/migrations/050_user_settings_preferences.sql` for account appearance and privacy sync, `supabase/migrations/051_account_lifecycle.sql` for lifecycle timestamps, and `supabase/migrations/073_usernames.sql` for username support. Apply `supabase/migrations/071_password_reset_rate_limit.sql` before `supabase/migrations/072_secure_account_deletion_grace_period.sql`; both password-session revocation and account deletion depend on migration 071. The migrations have not been applied here. The settings page requires the complete preference schema before it reports a save or reset as successful.

The profile summary and editor use authenticated, own-account endpoints. Usernames are optional, normalized to lowercase, and unique case-insensitively; they must be 3–30 characters using letters, numbers, dots, and underscores, with alphanumeric first and last characters. Phone numbers are display-only and are not verified because member Twilio verification is not implemented. Profile summary and personal-data export responses are uncached. The export is a private JSON download containing account/profile fields, authored posts and community content, follows, favorites, notifications, and recorded activity; password values and credentials are excluded.

Successful application logins update `info_users.last_login` and record a sign-in event in `user_activity_log`. The Security category displays recent recorded events. Existing historical events remain available only to the extent they were recorded before this change.

Password changes verify the current password against Supabase Auth before updating the Auth account. Recovery uses Supabase Auth's expiring, single-use recovery link; the reset page accepts a recovery session only, and the server validates its access token and atomically consumes a keyed token fingerprint before updating the password and revoking sessions. Reset requests are limited to five per IP per 15 minutes by `supabase/migrations/071_password_reset_rate_limit.sql`; apply that migration to enable password-reset throttling, single-use fingerprints, and app-session revocation. Login remains available before migration using signed version-0 cookies, but recovery throttling and app-session revocation are unavailable until it is applied. Responses do not disclose whether an email is registered. Password-change and password-reset notifications use the existing SendGrid sender configuration. Recovery links are delivered by Supabase Auth, so configure its SMTP sender (recommended: the existing verified SendGrid sender) and allow `NEXT_PUBLIC_APP_URL/info/reset-password` in the Supabase Auth redirect URL list. The DAET CONNECT recovery template is in `supabase/templates/password-recovery.html`; upload the template to the hosted Supabase Auth email-template settings as well as applying local config. Recovery links expire according to the Supabase Auth email OTP expiry; the local Supabase config is set to one hour.

Password forms require at least eight characters with lowercase, uppercase, numeric, and special characters. Supabase Auth hashes and stores passwords; the application does not put passwords in logs or responses. `SUPABASE_SERVICE_ROLE_KEY` is required server-side for privileged updates and the rate-limit RPC. `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` enable security notifications; if they are missing or delivery fails, the password operation still succeeds and the UI explicitly reports that the notification was not delivered.

Language support covers settings and selected navigation labels, not the entire application or user-generated content; missing labels fall back to English. The notification inbox applies the new-follower, comment/reply, and announcement preferences when listing notifications and calculating unread counts; this does not disable email or browser push delivery. Email alerts and activity digests do not have delivery implementations. Search visibility is enforced by people search, and the message-conversation preference is enforced when starting a new conversation; existing conversations remain available. The saved online-status, activity, and mention preferences do not currently have corresponding enforcement paths. Profile visibility uses existing rules and does not hide previously published posts. No 2FA enrollment is provided.

Display changes apply immediately. A valid device-saved theme takes precedence over the profile mirror, which is used only when no device theme is saved. This prevents a stale profile value from changing the theme during Settings-page revalidation. Reset writes the default account preferences before clearing and restoring the device preferences; failures leave the current settings intact and show an error. Preference reads and writes use the signed HTTP-only application session and are scoped to that session's user id. Authenticated writes and push prompts still require testing with a signed-in account. Global sign-out revokes the Supabase auth session and clears the current device, but the app's stateless signed cookies on other devices are not revoked; server-side session revocation is still needed for a true all-device guarantee. Global dark utility remapping warrants visual review across routes.

Deactivation sets the `info_users` status to `suspended` and signs the user out; signing in again exposes a reactivation action. Deletion requires current-password reauthentication and atomically sets `pending_deletion`, the request timestamp, and a deadline exactly 30 days later. It increments the application session version and globally signs out Supabase sessions. Pending accounts are blocked by the proxy and by restrictive active-account RLS policies; lifecycle status is uncached because stale status could allow use after scheduling.

After sign-out, the user can restore the account at `/info/account-recovery` by verifying the account email and password. A database function only cancels while the deadline is still in the future and no deletion worker has claimed the account. The daily Vercel Cron endpoint `/info/api/cron/account-deletions` runs at 00:00 UTC, sends 7-day and 1-day reminders, and permanently removes due accounts, their manifest-tracked storage objects, Supabase Auth identity, and profile-linked data. The deadline is enforced in the database; processing occurs on the first successful run after the deadline, up to approximately 24 hours later. Configure a random `CRON_SECRET` of at least 32 bytes and the existing `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` values. Reminder send failures are retried; request/cancellation email failures are surfaced in the UI but do not roll back account state.

Apply migration 072 before deploying the changed upload route, which now records each user upload in `user_storage_objects`. This manifest makes new uploads attributable and deletable. Older files in generic shared folders may not have enough ownership metadata for safe automatic cleanup and require a separate audit/backfill. Authored content follows the existing foreign-key behavior (cascade or author anonymization). Run this flow against a staging Supabase project before production; no live account lifecycle test is implied by the local code changes.


## Notification inbox behaviour (`/info/user/notifications`)

- Read state is per notification. Opening a notification, "Mark read", and "Mark all read" clear the unread flag; loading the page no longer marks the whole list read, so the New/Earlier split, unread dots, and the bell badge stay meaningful.
- The header bell badge uses the server's exact `unread_count` (from `GET /info/api/notifications`) instead of counting the loaded page, which is capped at 50 rows.
- Incoming notifications arrive over Supabase Realtime, play a short chime, and update the badge through the `daet-notifications-updated` window event consumed by `UserTopHeader`, `MobileNav`, and the dashboard.
- The chime is opt-in per device and stored at `daet:notification-sound` (`'on'` / `'off'`), a display-only preference that contains no personal data. It is a separate key from `daet:user-settings:v1` because it is scoped to the notification inbox, not to account settings.
- The notification list cache stays memory-only and user-scoped (`notifications:user:{userId}`, 30 s TTL) with invalidation after every read-state, delete, and follow-action write.

## Implementation

- Model and storage: [`src/lib/userSettings.js`](../src/lib/userSettings.js)
- Signed-session preference API: [`src/app/(subsystems)/info/api/user/settings/route.js`](../src/app/(subsystems)/info/api/user/settings/route.js)
- Search visibility enforcement: [`src/app/(subsystems)/info/api/search/users/route.js`](../src/app/(subsystems)/info/api/search/users/route.js)
- Message privacy enforcement: [`src/app/(subsystems)/info/api/messages/route.js`](../src/app/(subsystems)/info/api/messages/route.js)
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
Stale behavior: A valid saved device theme remains authoritative over its profile mirror; other account preferences revalidate from the profile.
Missing-cache behavior: Use the profile theme when no valid device theme exists; otherwise keep the saved device theme. English remains the default until settings load.
Invalidation trigger: Successful save/reset invalidates profile:user:{userId}, feed:user:{userId}, and notifications:user:{userId}.
Cache layer: Display-only localStorage; account preferences in component memory (no reusable read cache).
Cache key: daet:user-settings:v1 contains only theme, language, reduceMotion.
TTL: Display preferences persist until reset or version mismatch; account preferences fetched fresh on each visit.
Offline behavior: Display preferences work locally. Account writes are NOT queued; reconnect and press Save again.
Security notes: No tokens, passwords, email, privacy flags, or notification flags in the device envelope. Legacy mirror helpers remain for compatibility but are not read/written by the new settings page.
Manual clear method: Settings > Data & storage ("Clear cached data" -> clearLocalAppData, "Reset to defaults" -> resetUserSettings after the account reset succeeds)
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