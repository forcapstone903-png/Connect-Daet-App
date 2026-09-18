# Notification delivery

## Application behavior

The shared follower-delivery helper is used by user forum/event creation and admin forum publication. It reads current followers from Supabase, excludes the author, deduplicates recipients, and writes unread notifications after content is saved. Drafts do not notify followers.

Follow, reaction, and comment handlers retain their real database-backed implementations. Removing the automated harness does not remove these features or replace their data sources.

Delivery is best-effort, not a durable retry queue. The shared follower helper logs delivery failures; a saved publication must not be reported as failed merely because its notification delivery failed. Other notification producers retain their own error-handling implementations.

## Deployment review

Database migrations, RLS policies, notification preferences, and push webhook deployment must be reviewed in the target environment. Browser behavior and device push delivery still require acceptance verification with authorized accounts. Removing test code is not production certification.

The diagnostic API routes and automated test files have been removed. Optional Supabase seeding is disabled. The historical category migration retains its identity but no longer inserts sample accounts, tourism content, or fabricated activity on fresh installations. Already-applied database records are unchanged: review them with the tourism office and back up the database before any approved cleanup. Do not reset a live database to remove sample content.

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
