# System Recommendations

## Overall assessment

The system is **partially aligned** with the proposed title, “Daet Tourist Information, Engagement and Management System with Real-Time Updates.”

Tourist-spot management, announcements, blogs, events, and some admin operations have database/API wiring. However, the admin audit found several workflows that are still browser-only simulations or do not reliably persist. The audit did not verify live database behavior and does not establish that users receive real-time updates.

Treat “real-time updates” as an unverified requirement until it is implemented and tested. If the project does not intend to deliver timely live updates, revise the title to avoid promising that capability.

## Recommended work, in priority order

### 1. Confirm the system’s real-time requirements

- Identify which information must update live: for example, announcements, event changes, tourist-spot information, forum activity, or administrative dashboards.
- Agree on what “real time” means for each item (immediate push updates or a defined refresh interval).
- Choose and document the delivery approach, such as database change subscriptions or polling.
- Handle disconnects, reconnects, duplicate/out-of-order updates, and visible stale/offline states.
- Test updates across separate user sessions and confirm that users without permission cannot receive private/admin data.
- Until these checks pass, describe the feature as planned or unverified rather than implemented.

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

1. **Agree on scope and acceptance criteria** for “real-time updates” and engagement.
2. **Close security and data-integrity risks** with authorization tests, secret rotation, and scheduled-post/error-handling fixes.
3. **Implement persistent engagement workflows** for registrations, messaging, forum, and moderation.
4. **Replace or clearly label mock admin features** and make media/settings/export behavior honest and reliable.
5. **Implement and test the agreed live-update workflows.**
6. **Run targeted lint, automated tests, and an end-to-end pass** against a test environment before claiming full alignment.

## Completion criteria

The title is well-supported when the core tourist information and management workflows persist correctly; engagement actions perform the operation they claim; role-based access and failures are tested; and each promised real-time update is demonstrated across separate sessions with documented behavior during connection loss. Until then, the system should be presented as partially aligned, with real-time capability not yet verified.

## Basis and limitations

These recommendations are based on the findings and scope described in [ADMIN_SYSTEM_AUDIT.md](./ADMIN_SYSTEM_AUDIT.md). That audit focused on admin routes and workflows; it did not provide a complete review of every public-facing page or runtime behavior. Recheck findings against the current code and a configured test environment before treating each item as still outstanding or complete.
