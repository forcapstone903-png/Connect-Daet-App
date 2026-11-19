# Notification delivery

## Application behavior

The shared follower-delivery helper is used by user forum/event creation and admin forum publication. It reads current followers from Supabase, excludes the author, deduplicates recipients, and writes unread notifications after content is saved. Drafts do not notify followers.

The signed-in onboarding permission action requests browser permission and
creates/saves the device's push subscription in the same user gesture. A
browser permission grant by itself does not enable push delivery.

Follow, reaction, and comment handlers retain their real database-backed implementations. Removing the automated harness does not remove these features or replace their data sources.

Follower and general activity delivery is best-effort, not a durable retry queue. The shared follower helper logs delivery failures; a saved publication must not be reported as failed merely because its notification delivery failed. Other notification producers retain their own error-handling implementations.

Account moderation email decisions use the service-role-only
`moderation_email_outbox`. Database decisions enqueue a deduplicated event;
the `/info/api/cron/moderation-lifecycle` job processes expired suspensions
and claims email events every five minutes. Failed deliveries retry with
backoff and stop after eight attempts; inspect failed outbox rows and email
provider configuration during operations. The job requires `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, and the existing SendGrid configuration. Configure
`NEXT_PUBLIC_SITE_URL` (or `SITE_URL`) to the canonical HTTPS origin so appeal
emails can construct links; Vercel deployments may use `VERCEL_URL`.

Banned users request a short-lived, single-use appeal link using their case
reference and registered email address. Only a token hash is stored; the
submission endpoint revalidates the token and current restriction in a
service-role database function. The public response does not disclose whether
the case and email matched.

Appeal details and review history are private, user/staff-scoped data and are
fetched with `no-store`; no shared or browser cache is introduced. Cache key:
none. TTL/invalidation: not applicable. Stale/offline behavior: refetch from
Supabase and show an explicit error if unavailable. Security classification:
confidential moderation and account data. Manual clear strategy: no cache to
clear; signing out clears the existing user-scoped inbox cache.

## Deployment review

Database migrations, RLS policies, notification preferences, and push webhook deployment must be reviewed in the target environment. Browser behavior and device push delivery still require acceptance verification with authorized accounts. Removing test code is not production certification.

The diagnostic API routes and automated test files have been removed. Optional Supabase seeding is disabled. The historical category migration retains its identity but no longer inserts sample accounts, tourism content, or fabricated activity on fresh installations. Already-applied database records are unchanged: review them with the tourism office and back up the database before any approved cleanup. Do not reset a live database to remove sample content.

## Central notification center

The in-app inbox and bell use the existing `info_notifications` table; the
separate legacy `notifications` table is not used by the application. The
notification API scopes every read, update, and delete to the signed-in user,
and the table's RLS policy allows authenticated users to read only their own
rows. Realtime subscriptions filter by recipient ID and reconcile after
reconnects and while the page is visible.

Existing API and database producers cover content announcements, event
submissions and moderation decisions, comments and reactions, follows,
feedback/inquiries, reports, staff messages, alerts, and event registrations.
Migration `114_event_activity_notifications.sql` additionally notifies active
members when a submitted event is approved. Migration
`115_registered_event_reschedule_notifications.sql` sends confirmed registrants
and saved-event users a dedicated notification containing the new date/time
when a published event is rescheduled. It replaces the legacy saved-event
change trigger to prevent duplicate cancellation or reschedule notifications.
No new notification table or shared notification cache is introduced.

## Cache decision

This cleanup introduces no read-heavy feature or new cache. Existing user-scoped cache keys, TTLs, successful-write invalidation, stale/offline behavior, and manual clear controls remain unchanged. Diagnostic responses are no longer served; deploy a fresh build to remove the old routes.

```text
Feature: Follower notification delivery
Data fetched: current followers, author display name, prior publication notifications
Change frequency: every publish/follow/unfollow
Visibility: user-specific
Freshness: current at write time
Stale behavior: do not use stale audience data
Missing-cache behavior: query database
Invalidation trigger: none introduced; inbox uses existing realtime/poll refresh
Cache layer: none for audience resolution
Cache key: none for delivery; existing inbox key notifications:user:{userId}
TTL: no delivery cache; existing inbox TTL 30 seconds
Offline behavior: log delivery failure, no false delivery count, no offline queue
Security notes: audience and notification content never persisted to shared browser storage
Manual clear method: no delivery cache to clear; existing inbox refresh/logout for inbox cache
```
