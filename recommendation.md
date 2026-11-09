# System Recommendations

## Overall assessment

The system is **partially aligned** with the proposed title, “Daet Tourist Information, Engagement and Management System with Real-Time Updates.”

Tourist-spot management, announcements, blogs, events, and some admin operations have database/API wiring. However, the admin audit found several workflows that are still browser-only simulations or do not reliably persist. The audit did not verify live database behavior and does not establish that users receive real-time updates.

Treat “real-time updates” as an unverified requirement until it is implemented and tested. If the project does not intend to deliver timely live updates, revise the title to avoid promising that capability.

## Recommended work, in priority order

### 1. Confirm the system’s real-time requirements

**Scope and freshness target agreed; implementation and end-to-end verification remain outstanding.** The agreed target is immediate push updates, with a 30-second reconciliation fallback:

| Information | Intended audience | Agreed freshness | Planned delivery |
|---|---|---|---|
| Published announcements | Visitors and signed-in users; administrators may also see/manage restricted announcements | Push, reconcile within 30 seconds | Supabase Realtime change notifications, followed by an authorized query |
| Event changes | Visitors and signed-in users; administrators may also see/manage restricted events | Push, reconcile within 30 seconds | Supabase Realtime change notifications, followed by an authorized query |
| Tourist-spot changes | Visitors and signed-in users; administrators may also see/manage restricted spots | Push, reconcile within 30 seconds | Supabase Realtime change notifications, followed by an authorized query |
| Forum activity | Users permitted to view the affected thread/activity; administrators may moderate | Push, reconcile within 30 seconds | Supabase Realtime change notifications, followed by an authorized query |
| Admin dashboard data for these streams | Administrators only | Push, reconcile within 30 seconds | Admin-authorized queries after Supabase Realtime notifications |
| Existing private notifications and messaging | Only the intended user or conversation participants | Push; reconcile within 30 seconds where applicable | Keep user/conversation-scoped subscriptions and authorized reloads |

The 30-second target is a maximum reconciliation interval while a page is visible, not a guarantee of delivery during a network outage. “Push” means the client should refresh promptly after a database change notification; it does not make the browser’s local state authoritative. Admin dashboard scope here is limited to the agreed announcement, event, tourist-spot, and forum data, not unrelated health/weather measurements.

**Current implementation evidence:**

- Announcement administration currently refetches every 30 seconds. The visitor announcement flow and the dashboard’s initial feed load do not establish push delivery for announcement changes.
- The dashboard has a user-filtered notification subscription, but its content feed is initially loaded rather than kept current by a content-change subscription.
- Event detail currently subscribes to reactions, comments, and reposts, not event-record changes. Tourist-spot detail similarly subscribes to engagement changes, not spot-record changes.
- Existing notification and messaging pages have some Realtime subscriptions; notifications also poll, and messaging contains reconnect handling. This is partial wiring, not proof of end-to-end delivery or authorization.
- The migrations inspected enable RLS for the content tables and define public/admin/owner SELECT policies. The inspected Realtime migrations add other tables, but do not establish that announcements, events, tourist spots, or forum activity are in the deployed Realtime publication. The deployed database configuration and policies must be checked directly.

**Implementation requirements:** Add the agreed content subscriptions and 30-second reconciliation; re-query through existing authorized reads rather than trusting broadcast row data; deduplicate events by record ID and ignore older versions; expose reconnecting/offline and last-successful-refresh state; retry subscriptions with bounded backoff; and refresh when a hidden tab becomes visible again. Do not send private/admin row contents through a public channel.

**Verification still required:** In a configured test deployment, publish/update each stream from a second session and confirm prompt delivery plus the 30-second reconciliation bound; simulate duplicate and out-of-order notifications, disconnect/reconnect, offline/online transitions, and tab visibility changes; and test anonymous, regular-user, conversation-participant, and administrator accounts to confirm unauthorized users cannot receive private messages, restricted content, or admin data. Verify the deployed Realtime publication and RLS policies as part of this test.

No configured two-account test session or deployed database inspection was available during this review, so those checks have not passed here. Until they do, describe real-time content updates as **planned/unverified**, not implemented.

### 2. Make engagement workflows persistent and real

- **Messaging:** Replace fabricated sample recipients and browser-only send, schedule, reply, and read-receipt actions with authenticated, database-backed workflows and actual delivery where required. Do not show success unless the operation succeeds.
- **Event registrations and reminders:** Connect registrations to the `event_registrations` table using valid user IDs. Implement actual reminder delivery and report delivery failures accurately.
- **Forum categories and pinning:** Persist categories and pinned status in the database, and return them from list/detail APIs so they survive reloads.
- **Moderation:** Persist reports, blocked-user status, and moderation logs through authorized server-side operations instead of `localStorage`.
- **Blog controls:** Persist featured status. Prevent future-scheduled posts from becoming public before their scheduled time, and check database mutation errors before showing success or clearing selections.

### 3. Replace mock admin controls and misleading status with real operations

- Persist shared general settings, notification templates/preferences, and moderation preferences in an authenticated server-side store, or clearly label/remove controls that are not supported.
- Replace hardcoded system-health and database metrics with actual checks, or label them as unavailable rather than presenting fixed values as live measurements.
- Correct the settings overview export so failed table reads are reported and cannot produce a false success message.
- Connect media uploads to durable storage with appropriate access controls; otherwise remove or label upload/optimization controls as demonstrations.
- For backup and restore, keep the existing versioned, merge-only behavior, but document that schedules, remote archival, media backups, and transactional restore are not available. Store downloaded snapshots securely.

### 4. Finish reliability and navigation work

- Fix the two reported admin lint errors, then rerun the targeted lint check.
- Check all admin links, nested routes, and tabs against their intended destinations.
- Keep user-facing confirmations and notifications tied to successful server responses; surface partial restore progress and other failures clearly.

### 5. Verify security and production behavior

- Add authorization tests for anonymous users, regular users, and administrators for every `/info/api/admin/**` handler.
- Apply `supabase/migrations/065_site_maintenance_settings.sql` in each target environment and verify maintenance-mode behavior.
- Rotate the previously exposed weather-provider key and configure the replacement as server-only `OPENWEATHER_API_KEY`.
- Test database persistence, row-level policies, provider configuration, and user-facing flows with a test database and administrator account.
- Add automated tests for the critical workflows, especially access control, registration, scheduled publishing, messaging/reminders, and update delivery.

## Suggested delivery sequence

1. **Real-time scope and freshness target are agreed** as recorded above; implement and pass the listed delivery and authorization checks before claiming the capability.
2. **Close security and data-integrity risks** with authorization tests, secret rotation, and scheduled-post/error-handling fixes.
3. **Implement persistent engagement workflows** for registrations, messaging, forum, and moderation.
4. **Replace or clearly label mock admin features** and make media/settings/export behavior honest and reliable.
5. **Implement and test the agreed live-update workflows.**
6. **Run targeted lint, automated tests, and an end-to-end pass** against a test environment before claiming full alignment.

## Completion criteria

The title is well-supported when the core tourist information and management workflows persist correctly; engagement actions perform the operation they claim; role-based access and failures are tested; and each promised real-time update is demonstrated across separate sessions with documented behavior during connection loss. Until then, the system should be presented as partially aligned, with real-time capability not yet verified.

## Basis and limitations

These recommendations are based on the findings and scope described in [ADMIN_SYSTEM_AUDIT.md](./ADMIN_SYSTEM_AUDIT.md). That audit focused on admin routes and workflows; it did not provide a complete review of every public-facing page or runtime behavior. Recheck findings against the current code and a configured test environment before treating each item as still outstanding or complete.
