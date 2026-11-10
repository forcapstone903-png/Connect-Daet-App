# Daet Tourist Information, Engagement, and Management System

**Connect-Daet.ai** is a mobile-first tourism information, engagement, and management web application for Daet, Camarines Norte. It is intended to give visitors one place to discover local tourism information while helping residents, tourism stakeholders, and administrators publish updates and participate in the community.

This document describes the study objectives, implemented application areas, security design, deployment requirements, quality evaluation approach, and outstanding readiness checks. A feature appearing in the application does not by itself mean it is deployed, operational in production, or formally evaluated.

## 1. Purpose and study objectives

### General objective

Develop a functional system that improves information dissemination and stakeholder engagement for Daet's tourism sector.

### Specific objectives mapped to system requirements

| Study objective | System response | Evidence / qualification |
|---|---|---|
| Identify operational challenges and communication gaps in tourism information and visitor engagement. | Consolidate destination, event, announcement, story, and community information in a single visitor portal; provide interactive participation and visitor feedback. | Validate the actual pain points with tourism-office staff, local businesses, residents, and visitors. The software alone does not establish that the research interviews or needs analysis have been completed. |
| Analyze technical, functional, and security requirements, including push architecture, mobile standards, moderation, and admin access. | Use Next.js, Supabase, responsive pages, an opt-in Web Push integration, moderation/admin areas, server-side route authorization, and database access policies. | Push requires production infrastructure. Review security gaps and deployment checks in [Security and production readiness](#9-security-and-production-readiness). |
| Design and develop a mobile-responsive portal with alerts, community features, and analytics. | Provide visitor information, events, announcements, blogs, forums, feedback, notifications, and administrative content/analytics pages. | Site-visit statistics count consented public page views; estimated unique visitors are browser-based estimates, not verified people. The database migration and retention job must be deployed. |
| Evaluate performance and effectiveness using ISO/IEC 25010, prioritizing tourist usability on mobile. | Use the evaluation plan in [ISO/IEC 25010 evaluation](#11-isoiec-25010-evaluation-plan). | No formal ISO/IEC 25010 test score, acceptance result, or participant outcome is claimed by this README. Conduct and record the evaluation separately. |

## 2. User groups and access areas

### Public visitor

Can browse publicly available tourism content and use public search and discovery surfaces. An account is required for protected participation and personal features.

### Registered user / tourist

Can access personal dashboard, profile and settings, create or interact with community content, message other users, and manage personal content and preferences. Exact actions depend on authentication, account status, and database policies.

### Administrator

Can access the administration area for tourism content, users, announcements, community operations, notifications, settings, and analytics. Administrative route access is checked against the server session role; a role label in the browser is not intended to grant access.

### Moderator role

Moderation queues and community review surfaces exist. A separately enforced moderator permission tier has not been verified. In the current proxy, protected admin routes specifically require the `admin` role. Do not promise least-privilege moderator access until role-specific server checks and database policies are implemented and tested.

## 3. Feature inventory

### 3.1 Public tourism information

- **Tourist spots and attractions:** Browse active destination listings, search by destination name, location, category, or description, and narrow results using the categories present in the published data. Listing cards show the destination name, category, location, image, featured status, and displayed rating when available.
- **Destination details and trip planning:** Open a destination page for its description, image gallery, location, rating and view count, opening hours, entrance fee, and tap-to-call contact number when those fields are populated. Visitors can read and submit ratings/reviews, use the map when valid coordinates are available, save a destination to their trip list, and share it through Facebook, X/Twitter, email, or a copied link. Saving requires an account. The page also recommends active destinations in the same category, recent published forum threads, and popular published blog posts when available.
- **Data quality and travel guidance:** Destination detail pages identify missing hours, fees, or contact details and remind visitors that listing information may be incomplete or out of date. Visitors are advised to confirm details and local conditions before traveling. Optional planning notes appear only when supplied in a listing; they are not live forecasts or real-time crowd measurements.
- **Search and discovery:** The search page is available without signing in, so visitors can search published events by title, description, or location and open their public detail pages. The public events page also lets visitors search and filter upcoming published events. Search also covers active destinations by name, location, category, or description; published blogs by title, excerpt, body, or category; and published forum discussions by title or body. Results can be switched between destinations, events, blogs, forums, people, and community activity. People search is limited to active, non-admin profiles that are public or already followed by the viewer. Community activity is shown in connection with matching people and is not necessarily a direct keyword match. On the destination listing, visitors can additionally filter by categories present in the active destination data or search by name, location, category, or description.
- **Events:** Browse and search published upcoming events without signing in, open public event detail pages, and view the visitor landing page's upcoming-event calendar and event summaries.
- **Announcements:** Display active, published announcements that have not expired. Announcement type, priority, image, publication, and expiry are supported by the content model where populated.
- **Blogs and local stories:** Browse published stories, open individual story pages, and view author/community engagement information where available.
- **Public forums:** Browse, search, sort, and filter published discussion threads without signing in; open thread details and read a preview of replies. The listing loads current published data from Supabase on each visit without a persistent cache. Sign-in is required to read all replies, reply, subscribe, or use account-based reactions.
- **Visitor landing page:** Provides a mobile-first destination hero with public search, shortcuts to places, food search, events, stories, map, and emergency contacts, plus a safe-area-aware mobile Home/Explore/Map/Profile navigation bar. It also includes discovery sections, travel-planning prompts, destination guide cards, community highlights, upcoming events and a calendar, announcements, emergency contact information, and guest-accessible navigation to destinations, events, public discussions, and search.
- **Visitor data freshness:** Destination, blog, forum, event, announcement, and count feeds are read from Supabase when the page loads; no persistent cache is used for these landing-page feeds. Loading, empty, and failed-query states are distinguished, and query failures offer an in-page retry instead of being presented as empty results. Static editorial copy, hero artwork, and emergency contact values are maintained in the page source and are not live Supabase records.

### 3.2 Accounts and authentication

- Register an account using a name, email, and password.
- Confirm email and resend verification email.
- Sign in, sign out, and optionally remember the session.
- Request a password reset and submit a replacement password.
- Redirect authenticated users to the appropriate user or admin destination.
- The registration endpoint checks required fields and currently enforces a six-character minimum password length. This is a basic floor, not a complete password-strength policy.
- Password hashing helpers use bcrypt with a work factor of 12 for password values stored by the application. Supabase Auth is also used for authentication; deployment must confirm which password records and auth flows are authoritative.

### 3.3 User profile and dashboard

- View a personal dashboard and profile.
- Edit profile details and profile image where supported.
- View other users' public profiles and connections, with profile activity filtered by profile privacy and post/repost visibility. Private posts are restricted to their owner; followers-only posts require a follow relationship.
- Manage onboarding, personal posts, drafts, saved items, and profile archive.
- Manage account settings, appearance, language, notification preferences, privacy preferences, local data, and legal links.
- The settings UI offers English, Filipino, and Bikol language choices, as well as appearance and reduced-motion preferences. Verify translations and persisted preference behavior in each supported browser before acceptance testing.
- Account lifecycle and data export/clear actions are represented in settings and API routes. Confirm the production database, retention rules, and user-facing consent before enabling account deletion or export workflows.

### 3.4 Community participation

- Create, edit, and delete user blog content and drafts.
- Comment on blogs/posts, reply to comments, react to content, and mention users where supported.
- Create forum discussions and replies; forum replies support editing/deletion and media/mention features where configured.
- Follow or block users; view follower and following lists.
- Create posts, edit/delete posts, create reposts, and manage repost visibility/archive where applicable.
- Send direct messages, reply to messages, react, pin messages, view pinned-message activity, and manage archived conversations.
- Submit daily feedback and other visitor feedback/ratings.
- Earn/redeem rewards where enabled by database configuration.
- Engagement notifications are user-specific. Follower notification delivery is best-effort, not a durable retry queue; failed delivery must not imply the underlying publication failed.

### 3.5 Notifications and alerts

- View and manage in-app notifications, including read state and deletion.
- Receive application-generated notifications for supported content and social events.
- Opt in to browser push when the browser supports service workers, notifications, and Push API.
- Web Push uses a browser service worker, VAPID public/private keys, Supabase notification/subscription records, database webhook/bridge configuration, and a Supabase Edge Function.
- Push subscription writes are associated with the authenticated server-session user.
- iOS push support has platform requirements: users may need to install the site as a Home Screen app and grant permission from the installed app.
- **Operational qualification:** Push delivery is not guaranteed by the frontend alone. Deploy and verify migrations, database trigger/webhook, Edge Function, secrets, browser permissions, and target-device delivery. Delivery failures currently do not use a durable retry queue.

### 3.6 Administration and content management

Administrator pages provide management surfaces for:

- Tourist spots and attractions.
- Events and event media.
- Blogs and published content.
- Announcements, scheduled announcements, and notification history/send areas.
- Users, user status, roles, points, and account moderation actions where permitted.
- Community overview, forums, feedback, inquiries, and moderation queues.
- Media and file management, data import/export, backups, retention, and maintenance settings.
- Account profile, password, sessions, and security settings.
- Analytics pages for visitor, content, engagement, and reports.

Not every admin route is a separate feature implementation: some pages are navigational hubs and some older routes redirect to a consolidated screen or tab. Confirm the exact supported operations in the relevant page before using this list as an acceptance checklist.

### 3.7 Analytics and reporting

The admin analytics area reads database records for users, events, spots, blogs, feedback, and inquiries. The summary includes record counts, active-user counts, average feedback rating, and open inquiries; a summary export can be downloaded as CSV. Visitor statistics display actual consented public-page views for the latest 30 UTC calendar days, estimated unique browsers, daily trends, and the most-viewed public pages. The exported summary includes the 30-day page-view and estimated unique-visitor totals.

Analytics are disabled unless a visitor explicitly accepts analytics through the cookie notice. The persistent **Privacy settings** control lets visitors change their choice or withdraw consent; withdrawal stops future tracking and removes the browser identifier. The server stores only a SHA-256 hash of that random first-party identifier, an allowlisted public path, and the visit timestamp. It does not collect IP addresses, user-agent strings, referrers, account IDs, or query strings for this feature. Unique visitors are estimates: consent denial, cleared browser storage, multiple devices/browsers, and automated visits affect the count. Apply [migration 062](./supabase/migrations/062_site_visit_analytics.sql) and configure its daily 90-day cleanup job before relying on dashboard data. See [site visit analytics](./docs/site-visit-analytics.md) for definitions, deployment, privacy, and validation details. Other feedback and inquiry summaries are database-backed, but should still be independently validated before use as study evidence.

### 3.8 Progressive Web App and mobile-first interface

- Next.js web application with a PWA manifest and service worker.
- Selected static assets are cacheable; navigation requests are deliberately not served from an HTML cache so page content is not indefinitely stale.
- App chunks use network-first behavior with cached fallback when offline.
- The product is intended to work on narrow mobile screens and scale to tablet/desktop layouts.
- The public visitor page includes responsive mobile navigation with safe-area spacing and links to the existing public routes and map section.
- Global styling defines the requested blue primary action, green success, yellow warning, red error palette, rounded card surfaces, and minimum 44px sizing for button-like controls.
- These are design requirements, not proof of WCAG conformance. Validate every interactive control, including links, calendar cells, menus, dialogs, tables, and custom widgets.

## 4. Route map

The `(subsystems)` directory is a Next.js route group and does not appear in the URL. The `info` folder is a URL segment, so routes begin with `/info`.

| Route pattern | Purpose |
|---|---|
| `/info/visitor` | Public landing and discovery page |
| `/info/visitor/tourist-spots`, `/info/visitor/tourist-spots/[id]` | Visitor destination list and detail |
| `/info/visitor/events`, `/info/visitor/events/[id]` | Visitor event list and detail |
| `/info/visitor/blog/[id]` | Visitor blog detail |
| `/info/visitor/forum`, `/info/visitor/forum/[id]` | Visitor forum list and detail |
| `/info/visitor/search` | Visitor search page |
| `/info/login`, `/info/register` | Authentication |
| `/info/forgot-password`, `/info/reset-password`, `/info/confirm` | Recovery and email confirmation |
| `/info/user/*` | User dashboard, profile, content, community, messaging, settings, and notifications |
| `/info/admin/*` | Administrator dashboard, content, user, community, settings, and analytics tools |
| `/info/legal/*` | Accessibility, cookie, privacy, terms, consent, and related legal-information pages |
| `/info/api/*` | Application API routes |

The proxy preserves compatibility for legacy routes: old public page paths redirect to `/info/...`, old `/api/...` endpoints are rewritten to `/info/api/...`, and old `/admin/...` and `/user/...` paths redirect to their `/info` equivalents.

## 5. Application API capabilities

The API is organized under `/info/api`. Its current route groups cover:

- **Authentication and account:** login, registration, logout, email confirmation/resend, forgot/reset password, account lifecycle, and profile updates.
- **Administration:** users, tourist-spot management, forum management, and content-related notifications.
- **Tourism/community content:** user blogs, posts, comments, forum replies, reactions, and reposts.
- **Social relationships:** follow/unfollow, block/unblock, followers/following, and user search/profile retrieval.
- **Messaging:** conversations, message updates/deletion, reactions, pinned messages, and GIF discovery.
- **Notifications:** in-app notification retrieval and updates, push subscription registration, and activity tracking.
- **Feedback, rewards, and uploads:** daily feedback, reward redemption, and media upload/read/delete operations.

Each endpoint has its own authentication, validation, and error-handling behavior. Review route handlers and the deployed database's RLS policies before exposing new operations. Do not infer access control from the route name or from a hidden UI link.

## 6. Functional requirements checklist

Use this as a project acceptance checklist; each item should be tested against a staging database and representative mobile devices.

### Information dissemination

- [ ] Visitor can find destinations by name/category and open a detail page.
- [ ] Published events are visible in listings and calendar with correct local date/time.
- [ ] Active announcements appear only within their publication/expiry window.
- [ ] Published blog and forum content is visible according to publication and visibility policy.
- [ ] Empty, loading, offline, and query-error states are understandable and recoverable.
- [ ] Links from notifications and shared content resolve to the correct `/info/...` pages.

### Engagement

- [ ] User can register, verify email, sign in/out, recover a password, and edit profile.
- [ ] Authorization prevents users from modifying another user's private content.
- [ ] Blog, comment, forum, reply, reaction, follow, block, messaging, and feedback flows persist expected state.
- [ ] Users can manage notification preferences and in-app notification state.
- [ ] Push permission is opt-in; denied/unsupported/configuration-failure states are clear.
- [ ] Community abuse reports have an operational review and escalation process.

### Administration

- [ ] Only authorized administrator accounts reach admin APIs and pages.
- [ ] Admin can create, edit, publish, unpublish/archive, and delete each supported content type.
- [ ] User status/role actions are audited and cannot be self-escalated by an ordinary user.
- [ ] Moderators, if a separate role is required, have only their explicitly approved capabilities.
- [ ] Analytics values and exports reconcile with database queries and documented definitions.
- [ ] Backups, retention, import/export, and maintenance operations have approval and recovery procedures.

## 7. Data, persistence, and privacy

Supabase is the system's managed data service. The app uses tourism and community records such as user profiles, spots, events, blogs, announcements, comments, forum threads/replies, feedback, inquiries, social relationships, messages, notifications, and push subscriptions.

- Database structures and security policies are maintained as SQL migrations in `supabase/migrations/`.
- Public visibility should be determined by status/publication fields and database RLS, not only by frontend filtering.
- User-specific settings may include profile-backed preferences and device-local display settings; see [`docs/user-settings.md`](./docs/user-settings.md).
- Visitor page records are network-loaded and kept in component state; they are not intended to be cached in shared public storage.
- The service worker caches selected static assets and app chunks but does not cache page navigations as HTML.
- Define retention, account deletion, export, backup restoration, and incident-response policies with the data owner before production use.
- Minimize collection of location, contact, profile, and behavioral data. Provide notice and obtain consent where required by applicable privacy rules.

## 8. Technology and repository structure

- **Framework:** Next.js 16 App Router.
- **UI:** React 19, Tailwind CSS 4, and Lucide icons.
- **Backend/data:** Supabase Auth, Postgres, Storage, Realtime/notifications where configured, and Edge Functions.
- **Push:** Web Push with VAPID and `public/sw.js`.
- **Main system routes and related assets/components:** `src/app/(subsystems)/info/`.
- **Root app files:** `src/app/layout.js`, `src/app/page.js`, `src/app/globals.css`, and `src/app/manifest.js`.
- **Request routing and authorization:** `src/proxy.js`.
- **Shared application utilities:** `src/lib/`.
- **Database migration history:** `supabase/migrations/`.
- **Supplementary documentation:** `docs/`, `SUPABASE_SETUP.md`, and Supabase project READMEs.

## 9. Security and production readiness

### Existing security mechanisms

- Protected route handling is centralized in `src/proxy.js`.
- The server session is an HMAC-signed cookie with an expiration; cookie options include `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- The proxy checks the server-session role for administrator routes. Client-side session state is for UI and must not be trusted as an authorization control.
- Supabase Auth is the source of truth for account credentials. Passwords are never returned by the password APIs; the optional legacy profile hash is not used to authenticate accounts.
- Supabase RLS is present in migration history and should enforce row-level visibility and ownership.
- Push subscription registration requires a server session and validates the subscription fields before storing it.
- Logs include utilities to mask email and sanitize selected profile/registration fields.

### Required security work / verification

The following items must be addressed or formally accepted before production. They are called out so the project is not mistakenly described as security-certified:

1. **Session-signing secret:** Configure a strong, dedicated server-only `SESSION_SECRET`. The application falls back to `SUPABASE_SERVICE_ROLE_KEY` for compatibility, never to the public anon key. Rotating the signing secret invalidates existing server-session cookies; users will need to sign in again.
2. **Password policy:** Registration, password change, and recovery now enforce at least eight characters with lowercase, uppercase, numeric, and special characters. The local Supabase config enforces the same policy; set the equivalent policy in the hosted Supabase Auth settings.
3. **Rate limiting and abuse prevention:** Password reset requests now have a persistent five-per-IP-per-15-minute limit. Verify and implement appropriate rate limits for login, registration, verification resend, search, feedback, uploads, forum replies, and messaging; there is no comprehensive application-wide rate limiter.
4. **MFA:** `/info/admin/account/2fa` currently redirects to an account settings tab; it is not evidence that multi-factor authentication is implemented or enforced.
5. **Moderator authorization:** Confirm whether moderator is a separate role. If so, enforce its limited permissions in server handlers and RLS; current admin route gating requires `admin`.
6. **Database policy review:** Review every deployed table, view, function, storage bucket, and migration for RLS, least privilege, ownership checks, safe `SECURITY DEFINER` settings, and service-role use. Migration files in a repository do not prove that the production database has applied them.
7. **Transport and browser protections:** Enforce HTTPS, review security headers (including CSP, frame protection, MIME sniffing protection, and referrer policy), cookie behavior, origin/CSRF expectations, and upload content/size validation.
8. **Sensitive-data handling:** Keep service-role and VAPID private keys in trusted server/Edge Function secret stores. Never commit `.env.local`, secret values, session keys, or webhook credentials. Anything named `NEXT_PUBLIC_*` is bundled for browser access and must not be secret.
9. **Email and identity lifecycle:** Password recovery uses Supabase Auth's expiring, single-use link/session and a database-enforced one-use fingerprint. Verify recovery delivery, link expiry, notifications, session revocation, email confirmation, suspension, deletion, and recovery procedures against the production Supabase configuration.
10. **Audit and incident response:** Define auditable administrator actions, log retention, access review, backup/restore drills, breach response, and ownership of moderation escalations.

### Community moderation rules to define

Before public launch, publish and operationalize rules that specify:

- Prohibited content and behavior (harassment, hate, threats, spam, scams, impersonation, unlawful material, and exposure of personal information).
- Reporting categories, evidence capture, queue ownership, response targets, and urgent escalation for imminent safety threats.
- Review outcomes: no action, warning, content hiding/removal, temporary restriction, suspension, or account ban.
- Appeals, repeat-offender handling, conflict-of-interest rules, and moderator/admin audit trails.
- Retention and deletion of removed content and report records, consistent with policy and applicable law.
- Consistent rules for blogs, comments, forum threads/replies, messages, uploaded media, and public profiles.

The application has moderation surfaces; a complete written policy, response SLA, trained staffing, and moderation effectiveness are operational requirements rather than guaranteed software features.

## 10. Notifications and Web Push deployment

### Architecture

1. A signed-in user grants browser notification permission through an explicit UI action.
2. The browser registers `public/sw.js` and creates a Push API subscription using the public VAPID key.
3. The app sends the subscription to `/info/api/push-subscriptions`; the authenticated server associates it with the current user.
4. A notification database insert triggers the configured webhook/bridge.
5. The Supabase Edge Function sends a VAPID-signed Web Push message to that user's stored subscriptions.
6. The service worker displays the notification and opens its target URL when clicked.

### Deployment checklist

- [ ] Apply and review the push/notification migrations in sequence, including the notification bridge and compatibility repairs relevant to the target database.
- [ ] Configure the public VAPID key in the application environment.
- [ ] Configure the matching VAPID public/private keys, subject, and webhook/function secrets in Supabase; the private key must remain server-side.
- [ ] Deploy the `push` Edge Function and verify its authorization mode and logs.
- [ ] Configure the database webhook/trigger for the correct notification table and target function.
- [ ] Verify push subscription RLS/ownership and remove expired subscriptions safely.
- [ ] Test permission denied, unsupported browser, offline, expired subscription, retry/failure, notification click-through, and iOS installed-PWA flows.
- [ ] Communicate that delivery is best-effort unless a durable retry/queue and monitoring process is added.

See [`supabase/functions/push/README.md`](./supabase/functions/push/README.md), [`docs/notification-delivery.md`](./docs/notification-delivery.md), and [`docs/web-push-vite-setup.md`](./docs/web-push-vite-setup.md). The last document has Vite-oriented historical examples; this repository is Next.js, so follow its Next.js-specific instructions rather than copying the Vite startup snippet.

## 11. ISO/IEC 25010 evaluation plan

The research should define measurable test tasks, users, devices, procedures, and pass criteria before evaluation. Suggested criteria:

| Quality area | Example measures |
|---|---|
| **Usability / interaction capability (priority)** | Task completion rate/time for finding a destination, event, or alert; navigation errors; readability; participant satisfaction; ability to use controls at mobile widths. |
| **Accessibility** | Keyboard-only completion, focus visibility/order, screen-reader labels and announcements, color contrast, zoom/reflow, reduced-motion behavior, and touch target measurement. |
| **Functional suitability** | Correctness/completeness of published listings, search results, notification preferences, content CRUD, user-role restrictions, and feedback submission. |
| **Performance efficiency** | Mobile page load and interaction timing on representative networks/devices; image and bundle payload; API latency; database query response under realistic volume. |
| **Reliability** | Successful recovery from network/API errors, correct empty/loading states, session expiry/logout, push failure handling, and backup restoration. |
| **Security** | Authentication and authorization tests, RLS policy tests, input/upload abuse tests, dependency review, secret handling, and documented threat-model findings. |
| **Compatibility** | Current supported mobile/desktop browsers, screen sizes, installed PWA behavior, and iOS/Android push capability where applicable. |
| **Maintainability** | Reproducible installation/build, lint/test status, migration review, logging quality, and documented deployment/rollback procedures. |

Document: participant profile and consent, test device/browser/network, task script, expected result, observed result, metrics, severity of failures, remediation, and retest. Do not report synthetic analytics values as measured user behavior.

## 12. Setup and development

### Prerequisites

- Node.js and npm compatible with the project.
- A Supabase project for local or staging integration.
- Supabase environment credentials and a reviewed database migration plan.

### Install and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Public visitor routes begin at `/info/visitor`.

### Environment variables

Create `.env.local` at the repository root. Example names (use credentials belonging to your own environment):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
SESSION_SECRET=your-strong-random-server-only-session-secret
NEXT_PUBLIC_APP_URL=https://your-daet-connect-domain.example
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
SENDGRID_API_KEY=your-private-sendgrid-api-key
SENDGRID_FROM_EMAIL=verified-sender@example.com
CRON_SECRET=your-32-byte-or-longer-random-server-only-secret
```

`SESSION_SECRET` should be generated as a strong random server-only value and must never use a `NEXT_PUBLIC_*` name. If omitted, the application uses `SUPABASE_SERVICE_ROLE_KEY` as its signing secret for backward compatibility.

`NEXT_PUBLIC_APP_URL` must be the canonical site origin and must be allowed in Supabase Auth's redirect URL list. Apply `supabase/migrations/071_password_reset_rate_limit.sql` to enable password-reset throttling, single-use reset-session fingerprints, and app-session revocation. Until applied, login can establish a secure version-0 cookie, but password recovery and revoking other app sessions are unavailable; apply the migration promptly. Set hosted Supabase Auth's minimum password length to 8, require lowercase/uppercase/digits/symbols, and set the recovery email OTP expiry (local config is one hour). Configure the branded recovery template from `supabase/templates/password-recovery.html` in hosted Supabase Auth.

Apply `supabase/migrations/072_secure_account_deletion_grace_period.sql` after migration 071. It adds the `pending_deletion` state, atomic lifecycle functions, session-version revocation, restrictive active-account RLS checks, and an upload ownership manifest. Deploy the application only after both migrations are applied: the upload API requires the manifest table. The user must verify their current password to request deletion. The request invalidates application and Supabase Auth sessions; the public `/info/account-recovery` page allows a user to verify their email/password and cancel before the deadline. Account lifecycle emails use `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`; if these are unavailable, the request still succeeds but the UI reports that its confirmation email was not sent. Reminder delivery is retried by later cron runs.

The hourly Vercel Cron in `vercel.json` calls `/info/api/cron/account-deletions`. Set `CRON_SECRET` in Vercel to a cryptographically random server-only secret of at least 32 bytes; Vercel sends it as a bearer token. The job deletes only after the database deadline has passed, so deletion occurs on the first successful scheduled run after the 30-day deadline (up to approximately one hour later), not before it. Ensure the deployment plan supports hourly cron schedules, or configure an equivalent trusted scheduler. The job cleans manifest-tracked uploaded files, deletes the Supabase Auth user and profile (allowing schema cascades/author anonymization), and sends 7-day/1-day reminders. Files uploaded before the manifest was deployed may be in generic shared folders and cannot all be safely attributed automatically; review/backfill those files separately before promising their deletion.

`SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are server-only deployment variables used for password security notifications and the administrator email-delivery test. Configure Supabase Auth SMTP with the verified SendGrid sender (host `smtp.sendgrid.net`, port `587`, username `apikey`, and the API key as password) for recovery email delivery. Never add the API key to a `NEXT_PUBLIC_*` variable or browser storage. If notification delivery is not configured, password updates still complete and the interface reports the delivery issue. The maintenance-mode feature requires applying `supabase/migrations/065_site_maintenance_settings.sql` to the target database. Maintenance status is read uncached on each applicable request for immediate enforcement; if its database lookup fails, the proxy logs the error and allows the request through.

Configure VAPID private key, push subject, and webhook credentials as Supabase Edge Function secrets, not in this file or in browser-exposed environment variables. Do not copy real secrets into issue reports or documentation.

### Database and storage

Migrations live in `supabase/migrations/` and are numbered. Review their contents and current environment state before applying them. Use a staging database first; back up production before any approved migration. Verify deployed RLS policies, storage bucket visibility/upload policies, database functions, realtime configuration, and push triggers independently.

### Validation commands

```bash
npm run lint
npm run build
node --test
```

A successful local build or test run validates only the tested code paths. It does not certify external Supabase policy state, email delivery, push delivery, production secrets, security posture, device accessibility, or ISO/IEC 25010 results.

## 13. Go-live checklist

- [ ] Confirm scope and acceptance criteria with the Daet tourism office and study stakeholders.
- [ ] Deploy a staging environment and apply only reviewed migrations.
- [ ] Replace the session-secret fallback with a dedicated strong secret.
- [ ] Raise the minimum password requirement and review login/reset abuse controls.
- [ ] Verify account verification, login/logout, session expiry, role assignment, and revocation.
- [ ] Exercise every RLS policy using anonymous, ordinary-user, content-owner, admin, and (if used) moderator accounts.
- [ ] Review all API routes, file uploads, storage buckets, error messages, logs, security headers, and sensitive-data flows.
- [ ] Establish moderation policy, queue staffing, escalation response, and appeals process.
- [ ] Complete push infrastructure configuration and real-device delivery tests—or clearly mark push as unavailable.
- [ ] Apply migration 062, configure and monitor the daily analytics-retention job, and verify consented visitor statistics before using them for decisions or research.
- [ ] Test mobile usability/accessibility at the project target widths and on real devices, including keyboard and assistive-technology paths.
- [ ] Run ISO/IEC 25010 evaluation, record results and limitations, fix high-severity issues, and retest.
- [ ] Verify backups, restore procedures, monitoring, privacy notices, data retention, and production support ownership.

## 14. Project references

- [Supabase setup](./SUPABASE_SETUP.md)
- [Supabase directory overview](./supabase/README.md)
- [Push Edge Function setup](./supabase/functions/push/README.md)
- [Notification delivery behavior](./docs/notification-delivery.md)
- [Visitor page data and behavior](./docs/visitor-page.md)
- [Site visit analytics](./docs/site-visit-analytics.md)
- [User settings and caching behavior](./docs/user-settings.md)
- [Caching standards](./docs/caching.md)
