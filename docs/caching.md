# Caching Standard

Caching is part of the feature design, not an afterthought. Any data read more than once must have an explicit cache strategy, TTL, invalidation rule, and security review.

## Current Implementation

The shared implementation is in `src/lib/cache.js`:

- Authenticated profile and notification data use a user-scoped in-memory TTL cache. The Home feed is fetched without a client cache because its contents depend on current follow and privacy permissions.
- Public tourist spot data uses a versioned `localStorage` cache with a one-day TTL and background revalidation.
- Public visitor review previews use the shared in-memory cache with a five-minute TTL and stale-while-revalidate behavior.
- Logout clears user-scoped memory entries.
- Profile, follow, reaction, save, notification writes, and user-settings saves invalidate related memory entries.
- Persistent cache corruption, quota errors, and private browsing storage failures fall back to the network.

## Authenticated Home Feed

The Home and For You feed is personalized with the viewer's follow relationships
and content visibility permissions, so feed records and ranking signals are not
stored in a client cache.

```text
Feature: Authenticated Home and For You feed
Data fetched: Visible posts, reposts, editorial content, follow relationships, and viewer-specific recommendation signals
Change frequency: Content and account activity may change at any time
Visibility: User-specific; visibility is checked for the authenticated viewer
Freshness: Fetch on page load; refresh after publishing a blog, on owner-post realtime changes, other subscribed content changes, and 30-second reconciliation while visible
Stale behavior: Keep the last rendered feed during silent refresh; surface refresh errors without replacing it
Missing-cache behavior: No cache; fetch from the authenticated feed endpoints
Invalidation trigger: No cache; realtime events or manual feed refresh trigger a new fetch
Cache layer: None
Cache key: None
TTL: None

Offline behavior: Keep already-rendered feed content; refresh when the browser reconnects
Security notes: Feed visibility is enforced by the authenticated feed endpoint; no user-specific feed data or recommendation signals are persisted
Manual clear method: None; use pull-to-refresh to fetch the latest feed
```

## Post timestamps

Post age labels are derived from the existing `created_at` value in the client.
They are not separately cached or fetched. Labels update on the next relative
time boundary; posts younger than one day use relative time, posts from one to
six days old show their calendar date and age, and older posts show the date.
There is no cache key, invalidation, or manual-clear action.

## Admin destination popularity analytics

The admin dashboard reads the five most-viewed active destination detail pages
from consented `site_page_views` records for the last 30 days. Signed-in
accounts are identified by a server-keyed hash and counted once per destination
in that window; anonymous visitors use their consented browser identifier.
Destination popularity is computed from distinct visitor hashes by the database
and is not cached; the analytics API uses `no-store`.
There is no stale/offline value or manual cache clear. Analytics contains
pseudonymous visitor hashes and is restricted to the server-role database
function and administrator endpoint. If no eligible page views exist, the UI
reports that instead of displaying sample counts. Apply migration
`085_popular_tourist_spot_analytics.sql` before expecting this chart to load.

## Admin analytics and exports

The analytics report is computed by the database for the selected 7-, 30-, or
90-day period. It includes consented public traffic, coarse device categories,
user registrations, ratings, destination views, alert reach, inquiries, and
audit-log activity. Staff identity and activity details are returned only to
administrators; tourism officers receive aggregate tourism analytics. PDF and
Excel downloads use the same report and permissions as the dashboard.

```text
Feature: Administrator and tourism-officer analytics
Data fetched: Period aggregates and report rows; no raw visitor IDs, notification bodies, or user content
Change frequency: Updated when new visits, registrations, reviews, alerts, inquiries, or audit actions are recorded
Visibility: Private; analytics.view roles receive aggregates, and only administrators receive staff activity details
Freshness: Computed at request time for each dashboard load, period change, or export
Stale behavior: Do not present stale report data; show an explicit error and retry action
Missing-cache behavior: Query the database report function; show a clear error if the migration or data source is unavailable
Invalidation trigger: None; no cached report exists
Cache layer: None
Cache key: None
TTL: None; API and export responses use private, no-store
Offline behavior: No offline analytics or report downloads
Security notes: Signed staff session and analytics.view authorization; database aggregates run through a service-role-only function; staff details are administrator-only; device category is coarse and collected only after analytics consent
Manual clear method: Reload the dashboard or select a reporting period to request a fresh report
```

## Tourism-officer notification dropdown

The dashboard always reads the signed-in staff member's unread count. It fetches
the five newest notification previews only while the dropdown is open. The
count-only API response avoids fetching notification bodies and actor profiles
in the background; neither response is cached so new notifications and read
actions appear promptly.

```text
Feature: Tourism-officer dashboard notification dropdown
Data fetched: Unread staff-notification count; latest five staff notification previews and actor profiles while the dropdown is open
Change frequency: Changes when a notification is inserted, updated, or deleted
Visibility: Private; filtered to the signed-in user and fetched through the staff session
Freshness: Fetch count on dashboard load and on staff notification Realtime events, reconnect/visibility, and 30-second reconciliation; fetch the preview on open and refresh it on staff Realtime events while open
Stale behavior: Keep the last displayed count if refresh fails; log the error and retry on the next Realtime/reconciliation refresh
Missing-cache behavior: No cache; request the count-only endpoint or fetch the preview when opened
Invalidation trigger: No cache; notification changes refresh the count and, while open, the preview
Cache layer: None
Cache key: None
TTL: None; API responses use no-store

Offline behavior: Keep the last displayed count and preview; refresh after reconnect
Security notes: Count and previews are scoped to the authenticated user; alert-broadcast deliveries are excluded from the staff-notification scope and remain on the separate Alert Broadcasts page; the background count request returns no notification bodies or actor profiles
Manual clear method: None; marking a notification read updates the dropdown and the next Realtime refresh
```

## Rewards and point settings

The reward catalog and the signed-in user's redeemed reward IDs are read from
the database on each request. Admin changes and redemptions must be visible
immediately, so these responses use `private, no-store` and are not cached.

```text
Feature: Admin-configured rewards and point rules
Data fetched: Enabled reward catalog, point-award rules, and the current user's redeemed reward IDs
Change frequency: Administrators may update settings; rewards may be redeemed at any time
Visibility: Catalog is available only to signed-in users; point rules are administrator-only; redeemed IDs are user-specific
Freshness: Fetch from the authenticated APIs on page load; redeem and save operations write through to the database
Stale behavior: Do not display stale catalog or redemption state; surface a retryable load error
Missing-cache behavior: No cache; read the database directly
Invalidation trigger: No cache; reload after a successful settings save or redemption
Cache layer: None
Cache key: None
TTL: None

Offline behavior: No redemption or settings save is reported as successful while offline
Security notes: API responses are private and no-store; service-role database operations validate the user or administrator server-side
Manual clear method: None; reload to fetch current server data
```

## Public Tourist Spots

The public tourist-spots list stores only public spot records and revalidates from
Supabase on each page load. Successful admin changes clear the matching snapshot
in the current browser; other browsers refresh their snapshot on their next page
load.

```text
Feature: Public tourist-spots list
Data fetched: Public tourist spot records
Change frequency: Administrator controlled
Visibility: Public
Freshness: Background revalidation on every page load; one-day snapshot TTL
Stale behavior: Show the saved snapshot while revalidating; a failed refresh currently clears the list
Missing-cache behavior: Fetch from Supabase on first load
Invalidation trigger: Successful admin create, edit, status change, archive, or delete in the current browser
Cache layer: Persistent localStorage
Cache key: places:public:all:daet-content-v1
TTL: 1 day
Offline behavior: Cached spots may render initially; failed revalidation clears them
Security notes: Cache only public spot data; no authentication tokens or user-specific actions
Manual clear method: invalidatePersistentCache('places:public:all:daet-content-v1')
```

## Visitor Home Search Suggestions

The visitor home search performs short, debounced Supabase reads as the query
changes. Suggestions are intentionally not cached so newly published or
unpublished public content is reflected immediately.

```text
Feature: Visitor home search suggestions
Data fetched: Names of active public places and titles of approved, published events and stories matching the query
Change frequency: Tourism staff may publish, edit, or unpublish content at any time
Visibility: Public content only
Freshness: Fetch after a 200 ms typing debounce, including for one-character queries
Stale behavior: Do not show old suggestions for a changed query
Missing-cache behavior: No cache; query Supabase for matching suggestions
Invalidation trigger: No cache; each changed query fetches current public content
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Show that suggestions are unavailable; keep the search form usable
Security notes: Queries select only public names and titles and enforce active/published/approved status; no user-specific data is queried or stored
Manual clear method: None; changing the query or refocusing the search fetches current suggestions
```

## Admin Tourist Spot Management

The management page fetches the complete spot list from the private admin API
without browser or HTTP caching, then applies search, category, status, and sort
controls locally. It refreshes after successful writes and preserves the last
rendered list while showing an error if a refresh fails.

```text
Feature: Admin tourist spot management
Data fetched: Tourist spot records and management/engagement fields
Change frequency: Administrator edits and visitor engagement
Visibility: Private, administrator-only
Freshness: Fetch without cache on page load and after successful writes
Stale behavior: Keep the last rendered list and show a retryable error
Missing-cache behavior: Query the administrator API
Invalidation trigger: No cache; refetch after create, edit, archive, activate, or delete
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Keep already-rendered records and show the load error
Security notes: The API authorizes the administrator; responses are private and no-store
Manual clear method: None; reload the page to fetch current records
```

## Tourist spot address geocoding

The tourism listing form looks up coordinates when staff leave the address or
barangay field. Successful results are saved in the listing when staff save it.
The lookup is an explicit single-address request, not autocomplete. Apply
`112_tourist_spot_geocoding.sql` before enabling the lookup.

```text
Feature: Tourism listing address-to-coordinate lookup
Data fetched: Coordinates for one public tourist-spot address
Change frequency: Staff-triggered address lookup; saved listing coordinates change only when the listing is saved
Visibility: Public tourism address; lookup endpoint is restricted to tourism.manage staff
Freshness: Fetch on address/barangay blur; saved results can be refreshed manually
Stale behavior: Expired cached results are not used; lookup errors leave fields editable for manual coordinates
Missing-cache behavior: Query the configured Nominatim-compatible endpoint over HTTPS
Invalidation trigger: Address or barangay changes create a different cache key; Refresh coordinates bypasses and replaces the cached entry
Cache layer: Persistent browser localStorage and a service-role-only Supabase cache table
Cache key: tourist-spot-geocode:public:v1:{normalized Daet address}
TTL: 365 days
Offline behavior: No automatic coordinates for a changed address; staff can enter them manually
Security notes: No credentials or private user data are cached or sent to the provider; the server endpoint requires tourism.manage access, applies a shared one-request-per-second limit, and uses `NOMINATIM_SEARCH_URL` so the provider can be switched by configuration. OpenStreetMap attribution is shown in the form.
Manual clear method: Use Refresh coordinates to bypass the cached result; clearing the browser's site data also clears its localStorage copy
```

## Staff notification inbox and dashboard alerts

The staff inbox and dashboard bell read the signed-in staff member's notifications
from the existing user-scoped endpoint. Administrator workflow alerts (such as
reports, appeals, pending submissions, and feedback) use the same private inbox.
The inbox and badge poll while open and display errors instead of stale
notification data.

```text
Feature: Staff notification inbox and dashboard alerts
Data fetched: Private notification titles, messages, links, read status, and timestamps
Change frequency: New user submissions may arrive at any time
Visibility: Private; the API restricts records and read updates to the signed-in staff user
Freshness: Fetch on page load and every 30 seconds while the staff inbox, sidebar, or dashboard notification icon is open
Stale behavior: Keep the current rendered list during refresh; show an error and retry action if refresh fails
Missing-cache behavior: No cache; fetch directly from the authenticated notification API
Invalidation trigger: No cache; marking a notification read updates the displayed state after the API confirms success
Cache layer: None
Cache key: None
TTL: None; API responses use no-store
Offline behavior: Preserve the rendered list and show refresh errors; do not report read actions as successful offline
Security notes: Notification content is user-specific and is never placed in shared or persistent storage
Manual clear method: Mark individual notifications or the full inbox as read
```

## Visitor Review Preview

The public visitor page may show the latest published attraction reviews when review text is available.

```text
Feature: Public visitor review preview
Data fetched: Public tourist-spot review text, optional public review-photo URL, rating, date, and public reviewer ID/name/avatar
Change frequency: Occasional; updated when a visitor submits a review
Visibility: Public
Freshness: Five minutes
Stale behavior: Keep the last preview visible while revalidating; surface a retryable page error if revalidation fails
Missing-cache behavior: Fetch on first load; show no testimonial section if there are no reviews
Invalidation trigger: Successful attraction review upsert
Cache layer: In-memory
Cache key: visitor:public:reviews
TTL: 5 minutes
Offline behavior: Use stale in-memory reviews when available; otherwise surface the fetch error without placeholder reviews
Security notes: Only public review fields, public photo URLs, and the public reviewer ID are cached; authentication data and user-specific votes are not cached
Manual clear method: invalidateCache('visitor:public:reviews')
```

## Admin Dashboard Daily Visitors

The admin dashboard reads the established visitor metrics endpoint, which
returns daily distinct visitor estimates alongside page-view totals. The
dashboard uses the daily distinct count for its "Visitors Today" statistic and
the trailing seven-day chart.

```text
Feature: Admin dashboard daily visitors
Data fetched: Daily distinct anonymous visitor counts from site visit analytics
Change frequency: Updated as public page views are recorded
Visibility: Private, administrator-only aggregate
Freshness: Fetch current metrics on dashboard load
Stale behavior: Do not show stale counts; show an unavailable state if refresh fails
Missing-cache behavior: Fetch directly from the administrator-only analytics API
Invalidation trigger: No cache; a dashboard reload fetches current metrics
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Display an unavailable state; do not substitute a zero count
Security notes: Raw visitor identifiers are hashed server-side; the dashboard receives aggregates only
Manual clear method: None; reload the dashboard to fetch current metrics
```

## Tourist Spot Ratings and Reviews

The tourist spot detail page reads its rating summary, current review page, public reviewer profiles, and viewer-specific helpful votes directly from Supabase. It does not reuse the short-lived visitor testimonial cache because edits, deletions, and helpful-vote changes must be reflected immediately.

```text
Feature: Tourist spot ratings and reviews
Data fetched: Database-derived rating average/count/breakdown, one sorted review page with optional public photo URLs, public reviewer fields, and the authenticated viewer's own review/photo/helpful-vote state
Change frequency: Visitor-submitted; may change at any time
Visibility: Public ratings/reviews and public profiles; own review and helpful-vote state is user-specific
Freshness: Fetch current data on page load and after every successful write
Stale behavior: Do not present stale aggregates or viewer-specific state
Missing-cache behavior: No cache; fetch directly from Supabase
Invalidation trigger: No cache; successful writes reload the affected summary and current review page
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Show a retryable load error rather than placeholder ratings or reviews
Security notes: RLS protects rating writes, helpful votes, and profile visibility; no authenticated state is persisted in shared storage
Manual clear method: None; use the review section's retry action or reload the page
```

## User Activity History

The rewards page shows the signed-in user's latest activity-log entries. The
activity log is private and is fetched directly under the existing row-level
security policy.

```text
Feature: Private recent activity history
Data fetched: Up to eight of the current user's activity type, description, entity reference, and timestamp
Change frequency: Updated when the user performs a tracked community action
Visibility: Private; the current user only
Freshness: Fetch current entries on page load
Stale behavior: Do not show stale activity; display an explicit read error
Missing-cache behavior: Query the database directly
Invalidation trigger: No cache; reload the page to fetch recent activity
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Show an explicit error instead of implying activity history is current
Security notes: Activity rows remain behind user-scoped RLS and are never persisted or shared
Manual clear method: None; reload the rewards page
```

## Public Event Details

```text
Feature: Public event details
Data fetched: Public event description, location, dates, status, participant count, cover media, public organizer name/avatar, and related event previews
Change frequency: Administrator moderation and organizer updates
Visibility: Public event and public profile fields; viewer-specific actions excluded
Freshness: Fetch current approval state on every page load and refresh
Stale behavior: Do not render stale event or related-event content; show the retryable page error when offline
Missing-cache behavior: Fetch on first load; show the existing retryable page error if offline
Invalidation trigger: Not applicable; event content is not cached
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No stale event details are shown; surface the retryable fetch error
Security notes: Event approval can change when an organizer edits an approved event, so stale public content must not bypass the approval check
Manual clear method: Not applicable
```

## Tourism Officer Event Calendar

The Tourism Officer dashboard calendar queries only the visible date range and
approved, non-cancelled events, including drafts that staff need to manage. It
uses the authenticated Supabase client and tourism-staff RLS policy, with no
browser-side data cache. Creating, editing, deleting, selecting a date, and
dragging/resizing events use the same event table and staff permissions as the
existing event-management calendar.

```text
Feature: Tourism Officer dashboard event calendar
Data fetched: Approved, non-cancelled event titles, dates, times, categories, locations, descriptions, and statuses for the visible calendar range
Change frequency: Tourism staff may create, edit, publish, or cancel events at any time
Visibility: Authorized tourism staff; event approval and tourism-staff RLS policies are enforced
Freshness: Fetch when the calendar opens, changes month, or the user selects Refresh
Stale behavior: Do not present cached calendar data as current; show a retryable load error
Missing-cache behavior: Query Supabase for the visible calendar range
Invalidation trigger: No cache; month navigation or manual Refresh fetches the latest range
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Show the calendar error and allow a manual retry; do not create placeholder events
Security notes: Queries and writes use the authenticated Supabase client and RLS restricts tourism staff access; reads exclude unapproved events and cancelled events are not shown; no author identity or private fields are selected or cached
Manual clear method: None; use Refresh to re-query the visible date range
```

## Persistent Engagement Workflows

These workflows read mutable, user-specific or administrator-only database
records. They intentionally bypass shared client caches and use private,
no-store API responses. Successful writes refresh the relevant view from the
database; offline clients keep only already-rendered content and do not invent
success or delivery state.

```text
Feature: Admin messages and read receipts
Data fetched: Active recipient accounts, administrator message history, and per-recipient read timestamps
Change frequency: Changes on each send, scheduled delivery, and recipient read
Visibility: Private; administrator history and recipient-scoped notifications
Freshness: Fetch current data when the admin messaging page opens and after writes
Stale behavior: Keep the last rendered view only; label failures and do not synthesize receipts
Missing-cache behavior: Fetch directly from the authenticated admin API
Invalidation trigger: Successful message write or refreshed page data
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No send or schedule success is shown without a successful database operation
Security notes: Recipient IDs and administrator identity are validated server-side; messages are stored per recipient and delivered through the authenticated in-app notification inbox
Manual clear method: None; reload message history

Feature: Shared staff chat
Data fetched: The latest 100 messages in the shared staff conversation and their sender profiles
Change frequency: Changes on each staff message
Visibility: Private internal communications; active administrators, Tourism Officers, and Moderators only
Freshness: Fetch on page open and poll every 15 seconds while the chat is open
Stale behavior: Keep already-rendered messages and show a retryable error if refresh fails
Missing-cache behavior: Fetch directly from the staff-authorized API
Invalidation trigger: No cache; a successful send is appended and subsequent polls fetch the latest messages
Cache layer: None
Cache key: None
TTL: None; responses are private and no-store
Offline behavior: Keep rendered messages; do not claim a send succeeded without server confirmation
Security notes: The API checks the signed staff session and confirms the account is active with the same stored staff role; database access is service-role-only and message content is not persisted in browser storage
Manual clear method: None; the database retains the latest and historical messages

Feature: Event registrations and email reminders
Data fetched: The signed-in user's registration and administrator-visible registration records
Change frequency: Changes on each RSVP or administrator status update
Visibility: User registration is private; attendee lists and reminder logs are administrator-only
Freshness: Fetch directly on page load and after every successful write
Stale behavior: Keep the displayed view and surface retryable errors
Missing-cache behavior: Fetch directly from authenticated APIs
Invalidation trigger: RSVP, cancellation, admin status change, or reminder attempt
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Do not claim registration or reminder delivery while offline
Security notes: Registration uses the authenticated account UUID; email reminder outcomes are recorded per attendee
Manual clear method: None; reload event details or registrations

Feature: Forum categories and pinned threads
Data fetched: Public category names and forum thread category/pinned fields
Change frequency: Changes on administrator thread or category mutations
Visibility: Public forum fields; category and pin writes are administrator-only
Freshness: Fetch directly from Supabase/API on page load
Stale behavior: Show the last rendered list and report failed refreshes
Missing-cache behavior: Fetch current database state
Invalidation trigger: Successful category, thread, or pin write
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No category or pin mutation is reported successful without a database write
Security notes: Category and pin mutations use administrator-authorized APIs; public reads include only public thread fields
Manual clear method: None; reload the forum

Feature: Moderation reports, restrictions, and audit history
Data fetched: Open reports for content, comments, reposts, reviews, and accounts; active publishing restrictions; moderation audit entries
Change frequency: Changes on report submission, resolution, restriction, or restoration
Visibility: Private; moderation data is administrator/moderator-only
Freshness: Fetch directly from authenticated APIs
Stale behavior: Keep the last rendered data and surface request failures
Missing-cache behavior: Fetch from the database
Invalidation trigger: Successful moderation mutation followed by a database refresh
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Do not show successful report or moderation actions without server confirmation
Security notes: Reporter identity is derived from the signed-in server session; report queues are private; account-report approval records the suspension and resolves the report atomically; publishing restrictions are enforced by database triggers and authenticated APIs
Manual clear method: None; reload moderation data

Feature: Moderator dashboard action queues
Data fetched: Counts for pending blog/community submissions, open reports, appeals, flagged posts, and unanswered inquiries
Change frequency: Changes when a user submits content or a moderator completes an action
Visibility: Private; moderator/admin-only aggregate counts
Freshness: Fetch on dashboard load and manual refresh
Stale behavior: Keep the last successful summary visible alongside a refresh error; show no fabricated counts before the first successful load
Missing-cache behavior: Read current counts from the authorized moderation and blog APIs
Invalidation trigger: No cache; a dashboard reload or manual refresh reads current database state
Cache layer: None; responses are private and no-store
Cache key: None
TTL: None
Offline behavior: Surface the API error and retain only the last successful on-screen summary
Security notes: Service-role queries are behind staff authorization; responses contain aggregate counts only, not report text or user details
Manual clear method: None; use Refresh to request current counts

Feature: Featured and scheduled blogs
Data fetched: Public blog records, featured state, approval state, and publication timestamp
Change frequency: Administrator edits and scheduled publication timestamps
Visibility: Public blogs must be approved and due; private drafts remain owner/admin scoped
Freshness: Read directly from Supabase; no client or shared cache
Stale behavior: Do not use cached records to bypass current approval or due-time checks
Missing-cache behavior: Fetch current database state
Invalidation trigger: Successful featured/status/schedule write
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Keep rendered data but disable success claims for failed writes
Security notes: Public RLS and service-role public endpoints require approved status and a due publication timestamp
Manual clear method: None; reload the blog list
```

## Blog moderation and submissions

Blog moderation data and each author's submission statuses are fetched directly
from their authenticated API routes. Approval status can change immediately, so
the staff table, moderation history, and author submission list do not retain
client or persistent snapshots.

```text
Feature: Blog moderation and author submission status
Data fetched: Blog content and author details for staff; approval status and review feedback for the owning author
Change frequency: Changes whenever an author submits or edits a post, or staff review it
Visibility: Staff-only moderation data; owner-only submissions and feedback; public blog data is approved-only
Freshness: Fetch on page load and after every successful moderation action
Stale behavior: Do not show stale status or moderation history
Missing-cache behavior: No cache; display the API error and allow a fresh retry
Invalidation trigger: No cache; reload the affected list after a successful write
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Keep no fabricated status; surface the load error and retry when online
Security notes: Staff endpoints authorize the signed server session; owner endpoints scope records to the session user; public queries and RLS require approved status
Manual clear method: None; reload the moderation or submissions page
```

## Community guidelines

The public guidelines and moderator editor read the same settings row. The
content is uncached so edits become visible on the next page load; admin reads
are private, and public reads expose only the approved guidelines text.

```text
Feature: Community guidelines
Data fetched: Public guideline text; moderator editor reads the same content
Change frequency: Updated when a moderator saves a revision
Visibility: Public text; edit access restricted to moderators and administrators
Freshness: Fetch on page load; the API uses private/no-store or no-store responses
Stale behavior: Do not present stale rules after a failed request; show an error and retry
Missing-cache behavior: No cache; show the API error instead of invented rules
Invalidation trigger: No cache; a successful write is visible on the next read
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Retain the current editor value but do not claim a save succeeded
Security notes: The public endpoint returns only the guidelines text; it never exposes other admin settings
Manual clear method: None; reload the page
```

## Public Tourist Spot Details

The destination page caches only the public spot record and related destination previews. The rating summary, reviews, comments, profile identity, notifications, bookmarks, and reactions remain live and are never placed in the public cache.

```text
Feature: Public tourist spot details
Data fetched: Public destination fields and related spot previews
Change frequency: Administrator controlled; expected to be occasional
Visibility: Public destination data; viewer-specific actions excluded
Freshness: Two minutes
Stale behavior: Keep the last valid destination details visible while revalidating; show a refresh notice on failure
Missing-cache behavior: Fetch on first load; show a retryable page error if offline
Invalidation trigger: Two-minute TTL; invalidate the destination key when explicitly clearing cached details
Cache layer: In-memory
Cache key: tourist-spot-detail:public:{spotId}
TTL: 2 minutes
Offline behavior: Use stale in-memory public details if available; otherwise surface the fetch error without placeholder destination data
Security notes: Cache only public destination records and public related spot previews; never cache authentication, reactions, comments, bookmarks, or profile data
Manual clear method: invalidateCache(getCacheKey('tourist-spot-detail', 'public', spotId))
```

Do not move authenticated data into persistent browser storage without an explicit security review.

## Account lifecycle status

The account deletion state used by Settings and the request proxy is deliberately uncached. A stale active status could let a user keep using the application after requesting deletion; a stale deletion deadline could also show an incorrect recovery window.

```text
Feature: Account lifecycle status and deletion eligibility
Data fetched: Authenticated user's status and deletion timestamps
Change frequency: Security-sensitive lifecycle writes and daily deletion processing
Visibility: Private account data
Freshness: Read from the database for each applicable request; no cache
Stale behavior: Never use stale lifecycle state
Missing-cache behavior: Query the database; surface an error rather than assuming active status
Invalidation trigger: Not applicable; no cache
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Lifecycle actions fail explicitly; protected requests must not use a cached active state
Security notes: Never store lifecycle state in shared/public cache or rely on client timers for eligibility
Manual clear method: None
```

## Admin Weather

The admin dashboard requests current Daet weather and forecast data from Open-Meteo. Current observations can affect visitor safety, so the admin endpoint bypasses caches and never substitutes estimated conditions when the provider is unavailable.

```text
Feature: Admin dashboard weather
Data fetched: Current conditions and five-day provider forecast for Daet
Change frequency: Provider updates; dashboard polls every 30 minutes and supports manual retry
Visibility: Admin-only; weather itself is public, provider credentials are sensitive
Freshness: Fetch current provider data on each request
Stale behavior: Do not display stale weather after a failed request
Missing-cache behavior: Show a clear unavailable message and retry action
Invalidation trigger: No cache
Cache layer: None; upstream requests use no-store and the endpoint response is private/no-store
Cache key: None
TTL: None
Offline behavior: No forecast is shown; the retry action remains available
Security notes: Weather data is public; no provider credential is required or exposed
Manual clear method: None

## Visitor Daet weather forecast

The user dashboard shows current Daet conditions and the next five forecast
days. The public endpoint keeps provider credentials server-side, uses a
process-local cache to avoid repeated upstream requests, and falls back to
recent weather only briefly if the provider is unavailable.

```text
Feature: Visitor Daet weather forecast
Data fetched: Public current conditions and five-day forecast for Daet from Open-Meteo
Change frequency: Provider updates; dashboard refreshes on load and every 30 minutes, with manual refresh
Visibility: Public weather data; provider credential remains server-side
Freshness: 15-minute process-local cache
Stale behavior: Retry transient provider/network failures once after 300 ms; if still unavailable, show last successful forecast for at most 60 minutes and label it as recently saved. If a client refresh fails while it already has a forecast, retain it and show a refresh warning.
Missing-cache behavior: Show loading, then an unavailable message with retry; never invent weather values
Invalidation trigger: 15-minute TTL; clear the in-memory cache with clearDaetWeatherCache() when needed
Cache layer: Server process memory
Cache key: One fixed Daet forecast entry
TTL: 15 minutes; stale fallback up to 60 minutes from last success
Offline behavior: Use bounded stale forecast when available; otherwise show an unavailable message with retry. Each provider attempt times out after 8 seconds.
Security notes: Only public weather fields are returned; no provider credential is required or exposed. Attribute Open-Meteo in the UI.
Manual clear method: clearDaetWeatherCache() or restart the application process
```

## Search typeahead people suggestions

People suggestions are fetched only while a search field is focused and the
query contains at least two characters. Requests are debounced and capped at
five public profiles; a newer query cancels the previous request. Search
history remains a separate, user-controlled local preference.

```text
Feature: Search typeahead people suggestions
Data fetched: Up to five matching public profile names and avatar URLs
Change frequency: Profile names and visibility may change at any time
Visibility: Public profiles and follower-visible profiles for their followers; private profiles are excluded
Freshness: Fetch current matches after a 200 ms debounce
Stale behavior: Discard prior-query results; do not show results from a failed request
Missing-cache behavior: No cache; issue a bounded request after the query reaches two characters
Invalidation trigger: No cache; subsequent typing issues a fresh request
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Show the search action without placeholder people; report request failures in the console
Security notes: The server enforces profile visibility; responses are not persisted or shared between users
Manual clear method: None for people suggestions; clear recent query strings with the Reset history control
```

## Notification inbox preferences

The notification API reads the signed-in user's notification preferences from
their profile and applies supported category choices to inbox rows and unread
counts. The inbox's short-lived user cache is invalidated after preference saves.

```text
Feature: Notification inbox and category preferences
Data fetched: Current user's notification rows, unread count, and notification preference flags
Change frequency: New notifications and preference changes
Visibility: User-specific
Freshness: Live API read; inbox cache TTL is 30 seconds
Stale behavior: Realtime inserts re-fetch from the filtered API before display or sound
Missing-cache behavior: Fetch from the authenticated API
Invalidation trigger: Notification mutations and successful settings saves
Cache layer: User-scoped in-memory cache for the inbox; preferences themselves are not cached by the API
Cache key: notifications:user:{userId}
TTL: 30 seconds for the inbox cache; none for API preference reads
Offline behavior: Retain the current inbox view and show its retryable load error
Security notes: API derives the user id from the signed session; never share or persist notification data across users
Manual clear method: Reload the notification inbox or use Settings > Data & storage
```

## Saved dashboard items

The dashboard loads saved-item rows for the signed-in user and uses them to
render bookmark state and personalize feed ranking. Reads are uncached; save
and remove mutations update dashboard state only after the server confirms the
write.

```text
Feature: Dashboard saved items
Data fetched: Current user's saved content type and content id pairs
Change frequency: User-controlled save and remove actions
Visibility: User-specific
Freshness: Fetch on dashboard signal load; update UI only after a successful write
Stale behavior: No server cache; in-memory dashboard state is replaced on a successful load
Missing-cache behavior: Read from the signed-session API
Invalidation trigger: Successful save/remove updates the dashboard's in-memory state
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Keep current view and report save/remove request failures
Security notes: API derives ownership from the signed session; no favorite rows are shared or persisted in a browser cache
Manual clear method: None; reload to fetch the latest saved items
```

## Moderator discussion review

The blog and forum moderation previews load comment and reply pages only when a
specific post or thread is open. Pending and hidden discussion text is staff-only,
so these reads must not enter a shared, browser-persistent, or stale cache.

```text
Feature: Moderator blog and forum discussion review
Data fetched: Comments or replies and current comment-mute state for one selected post/thread
Change frequency: New comments/replies and moderator delete, mute, or restore actions
Visibility: Sensitive, staff-only moderation content
Freshness: Fetch page-by-page when preview opens; refresh after successful moderation actions
Stale behavior: Do not render stale discussion data; show a retryable load error
Missing-cache behavior: Read from the moderator-authorized API
Invalidation trigger: Successful delete/mute/restore reloads the open discussion; closing the preview discards its in-memory data
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No stale data; keep loaded rows visible and surface request failures
Security notes: API checks moderator authorization and returns private, no-store responses; never persist pending/hidden text or mute state
Manual clear method: Close the preview; reopening fetches current comments and replies
```

## Home For You recommendations

The Home feed fetches eligible published posts and reposts, ranks them using the
signed-in user's activity and preference signals, and records an impression
after a card remains at least half visible for 1.2 seconds. Follow suggestions
are inserted at a randomized position among the first six feed items. The
newest active admin announcement is pinned to the top of For You for 24 hours
after publication (or until its configured expiration, if earlier).

```text
Feature: Personalized Home For You feed
Data fetched: Publicly available posts and reposts, current follows, user-specific activity and saved-item signals
Change frequency: Content and follow changes; impression signals are recorded during feed viewing; announcement pin expires 24 hours after publication
Visibility: Mixed public content and user-specific personalization data
Freshness: Fetch current feed and follow permissions on page load or refresh
Stale behavior: Do not render cached feed records; failed loads show the dashboard error
Missing-cache behavior: Fetch directly from Supabase and signed-session APIs
Invalidation trigger: No feed cache; successful follow/content writes trigger a feed refresh
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No stale feed cache; retain the current in-memory view and report refresh failures
Security notes: The session-checked feed API filters account privacy, follower-only posts, and reposts before returning content; database row-level security remains authoritative for other feed sources. Activity data is scoped to the signed-in user and impression events do not create notifications
Manual clear method: None; feed reloads on refresh, while persisted activity signals remain user-specific
```

## Public Frequently Asked Questions

```text
Feature: Staff-managed FAQs shown on the visitor and registered-user dashboards
Data fetched: Published FAQ question, answer, and display order
Change frequency: Occasional; updated by administrators and Tourism Officers
Visibility: Public; draft FAQs are only returned by the staff management API
Freshness: Cached database reads for up to five minutes, explicitly invalidated after successful staff writes
Stale behavior: Next.js may serve stale cached data while revalidating after its TTL; successful writes expire the cache immediately
Missing-cache behavior: The first request queries the database; an unavailable database produces a retryable error instead of invented content
Invalidation trigger: Successful FAQ create, edit, publish, unpublish, or delete
Cache layer: Next.js server data cache; the API response itself is private and no-store
Cache key: `published-faqs-v1` with the `published-faqs` invalidation tag
TTL: 300 seconds
Offline behavior: No client-side offline snapshot; cached server data can remain available while a stale refresh is attempted, and a cache miss reports an error
Security notes: Only published, non-sensitive answers are cached. Table access is revoked from `anon` and `authenticated`; staff APIs use the service role after `feedback.manage` authorization.
Manual clear method: `revalidateTag('published-faqs', { expire: 0 })`; normal staff edits invoke it only after the database write succeeds
```

## Feature Decision Template

Every read-heavy feature should document these decisions in its feature change or pull request:

```text
Feature:
Data fetched:
Change frequency:
Visibility: public / user-specific / sensitive
Freshness: real-time / seconds / minutes / hours / days
Stale behavior:
Missing-cache behavior: first load / offline
Invalidation trigger:
Cache layer: memory / persistent / HTTP / CDN / server / database
Cache key:
TTL:
Offline behavior:
Security notes:
Manual clear method:
```

## Cache Key Convention

Use stable, scoped keys so user data cannot leak across accounts:

```text
feed:user:{userId}:{scope}
profile:user:{userId}
place:{placeId}
recommendations:user:{userId}
notifications:user:{userId}
search:{normalizedQuery}:{filtersHash}
```

Never use an unscoped key for user-specific data. Include relevant filters, locale, and audience in the key when they affect the result.

## Standard Strategies

### Feed and list data

Use in-memory data for the active view and a persistent snapshot when offline support is useful. Render the snapshot immediately, then revalidate in the background.

- TTL: 1 to 5 minutes
- Invalidate after a new post, edit, delete, like, comment, or moderation change
- Offline cache hit: show cached content with a stale indicator
- Offline cache miss: show the existing empty/error state and a retry action

### User profiles

Use memory plus a user-scoped persistent snapshot when the profile is visited repeatedly.

- TTL: 5 to 15 minutes
- Invalidate after profile edits, follow/unfollow, block, or privacy changes
- Never expose private profile fields through a shared/public cache

### Places and destinations

Cache aggressively because destination data changes infrequently.

- TTL: hours to days
- Prefer CDN/browser caching for images and media
- Invalidate after an admin edit, removal, or status change
- Use placeholders and progressive loading for media

### Recommendations

Prefer server-generated recommendations with a user-scoped cache.

- TTL: 15 to 60 minutes
- Invalidate after meaningful user activity or preference changes
- Do not treat stale recommendations as authoritative permissions or availability

### Auth and sessions

Auth tokens, refresh tokens, PII, and payment data must not be placed in plain `localStorage`, shared caches, or CDN caches. Use the existing secure/session mechanism and short-lived server-side sessions where applicable.

Session cache rules:

- Never cache authenticated API responses publicly
- Clear user-specific caches on logout and account switch
- Do not use cached auth state as proof of authorization
- Revalidate authorization on the server for every protected write

### Offline actions

Only queue reversible actions such as like, save, or follow when the application has a reliable sync mechanism. Do not fake success or queue irreversible actions such as delete, block, or report without an explicit product decision.

Queued actions must be idempotent, deduplicated, retried with backoff, and cleared after confirmed sync.

## Read and Write Rules

## Maintenance control-plane setting

The public maintenance flag is intentionally uncached: stale state could leave the site unavailable after an administrator disables maintenance, or expose the site after enabling it. The proxy performs a `no-store` database lookup for applicable requests. A lookup failure is logged and fails open so a database outage does not block the entire application.

```text
Feature: Public-site maintenance gate
Data fetched: Enabled flag and visitor-facing maintenance message
Change frequency: Administrator controlled; expected to be rare
Visibility: Public while maintenance is enabled
Freshness: Next applicable request after a successful update
Stale behavior: None; do not serve stale maintenance state
Missing-cache behavior: Read the database for each applicable request
Invalidation trigger: None; no cache is populated
Cache layer: None; HTTP request uses no-store
Cache key: None
TTL: 0
Offline behavior: Log lookup failures and fail open
Security notes: Service-role read stays in server proxy; message is public and React-escaped on the maintenance page
Manual clear method: None; there is no cache
```

### Stale-while-revalidate

For read-heavy data:

1. Read and validate the cached envelope.
2. Show valid cached data immediately.
3. Revalidate in the background when the TTL has expired or the cache is missing.
4. Replace the cache only after a successful response.
5. Preserve the last valid snapshot when revalidation fails.

A persistent cache entry should include an envelope similar to:

```js
{
  version: 1,
  cachedAt: 1710000000000,
  expiresAt: 1710000300000,
  data: {}
}
```

Handle malformed JSON, version mismatches, quota errors, and eviction by removing the bad entry and continuing with a network fetch.

### Invalidate on write

After a successful create, update, or delete:

- Update or remove the directly affected cache entry
- Invalidate related list/detail entries
- Refresh visible memory state immediately
- Do not invalidate before the write succeeds
- On failure, keep the previous state and show a retryable error

## HTTP and CDN Guidance

- Public immutable assets: use long-lived caching with hashed/versioned URLs
- Public API data: use explicit `Cache-Control`, `ETag`, or revalidation rules
- User-specific API data: use `private` or `no-store` as appropriate
- Sensitive responses must never be stored in a shared CDN cache
- External API fetches need a timeout, error fallback, and an explicit cache policy

## User Experience

A cache must never silently make the interface misleading:

- Show stale data with a subtle stale/offline state when freshness matters
- Keep loading and empty states distinct
- Provide retry on cache miss and failed revalidation
- Avoid replacing visible content with a blank state during background refresh
- Provide a manual refresh where users reasonably expect current data

## Manual Clear and Privacy

Each persistent cache family must have a named clear method for debugging and privacy. Logout must clear all user-scoped cache keys for the signed-out user. Settings or support tooling may expose a broader cache clear action, but it must not remove unrelated credentials or application configuration accidentally.

## Testing Checklist

For every cached feature, test:

- First load with no cache
- Fresh cache hit
- Expired cache and background revalidation
- Offline cache hit
- Offline cache miss
- Successful write invalidates or updates related entries
- Failed write leaves the previous state intact
- Logout clears user-specific entries
- Account switching cannot read the previous user's cache
- Corrupt, version-mismatched, or evicted cache entries recover
- Duplicate queued actions do not produce duplicate writes

## Review Checklist

A pull request adding or changing read-heavy data should answer:

- What is the cache key and scope?
- What is the TTL or invalidation trigger?
- Is stale-while-revalidate appropriate?
- Is the data public, user-specific, or sensitive?
- What happens offline and on cache corruption?
- How does a write invalidate related data?
- How can the cache be cleared manually?
- Which tests cover fresh, stale, offline, write, logout, and corruption paths?

Use shared cache helpers/hooks when available. Do not introduce one-off cache formats or permanent `localStorage` entries without documenting why.

## Administrator settings and media library

Shared administrator settings and media inventory are fetched directly from
administrator-authorized APIs. Settings are persisted in the database; media
objects live in Supabase Storage. Neither dataset is placed in browser or
shared caches.

```text
Feature: Shared administrator settings
Data fetched: Site information, moderation preferences, announcement templates, and notification preferences
Change frequency: Administrator edits
Visibility: Administrator-only
Freshness: Fetch current database values when each settings page opens
Stale behavior: Keep unsaved form edits only; show load/save failures and do not claim changes were persisted
Missing-cache behavior: Read from the database; disable saves if the read failed
Invalidation trigger: None; successful saves are reflected on the next fresh read
Cache layer: None; API responses are private/no-store
Cache key: None
TTL: None
Offline behavior: No save is reported successful without a database response
Security notes: Admin API authorization is required; the table has no client-facing RLS policy and is accessed with the server service role
Manual clear method: None

Feature: Administrator media library
Data fetched: Tracked administrator media object paths, type, size, and upload time
Change frequency: Changes on administrator uploads and deletes
Visibility: Inventory and mutations are administrator-only; objects use a public bucket and anyone with an object URL can view them
Freshness: Fetch directly from the admin media API on page load and after successful uploads
Stale behavior: Retain the last rendered list and show API failures
Missing-cache behavior: Fetch current storage tracking rows
Invalidation trigger: Reload after upload or delete
Cache layer: None; API responses are private/no-store
Cache key: None
TTL: None
Offline behavior: Upload and delete actions fail explicitly
Security notes: Upload/delete APIs require an admin session; only supported images/videos are accepted; public URLs must contain approved public-site media only
Manual clear method: Delete the object from the media library
```

## Editorial article details

Feature: Article author details, follow state, and story recommendations
Data fetched: Public author bio visibility, the viewer's follow relationship and preferred blog categories, published stories by the author and category, and popular published stories
Recommendation logic: Signed-in readers' existing preferred categories map to published blog categories; readers without saved preferences still see public author, category, and popular shelves
Change frequency: Changes when a profile, follow relationship, or published story changes
Visibility: Public story shelves; follow state and preferred categories are user-specific; author bio is shown only when the profile is public or the viewer follows the author
Freshness: Read directly from Supabase on article load; no client or persistent cache
Stale behavior: No stale recommendation snapshot is displayed
Missing-cache behavior: No cache is used; recommendation failures show an explicit retry action
Invalidation trigger: None; successful follow writes invalidate the existing profile and current-user feed caches
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Article interactions remain available where already loaded; author details and recommendations show unavailable with retry
Security notes: Only published stories are queried; preferences and follow state are queried only for the signed-in viewer; private author bio is hidden unless the viewer follows the author; follow writes use the authenticated follow API
Manual clear method: None

## Private account profiles

Feature: Private account identity, follow state, and shared content
Data fetched: Publicly discoverable profile identity, the current viewer's approved-follow/request state, and profile content only when the viewer is an approved follower
Change frequency: Privacy, follow-request, profile, and content writes may change visibility at any time
Visibility: Identity fields are searchable; private posts, reposts, and other profile content are restricted to approved followers
Freshness: Fetch directly from the profile API on every page load; no cache
Stale behavior: Never render cached private content or stale follow approval state
Missing-cache behavior: No cache is used; show the existing retryable profile error on fetch failure
Invalidation trigger: None; successful follow changes trigger a fresh profile request
Cache layer: None
Cache key: None
TTL: None
Offline behavior: No stale private data is shown; show a retryable load error
Security notes: API responses use `Cache-Control: private, no-store`; the profile page bypasses the shared memory cache, and RLS independently protects direct content reads
Manual clear method: None

## Administrator activity logs

Activity log pages and exports use the administrator-only activity endpoint with
server-side filtering and pagination. Results are not cached so new log entries
appear after refresh and filtered exports reflect current records.

```text
Feature: Administrator activity logs
Data fetched: Paginated activity records and exact filtered result count
Change frequency: New activity may be recorded at any time
Visibility: Administrator-only; records may contain personal activity details
Freshness: Fetch current page when filters or pagination change
Stale behavior: Do not present stale results as current; show loading and explicit errors
Missing-cache behavior: Read the requested page from the authorized endpoint
Invalidation trigger: Manual refresh or change of filters/page
Cache layer: None; API responses use private, no-store
Cache key: None
TTL: 0
Offline behavior: Preserve visible results and report request/export errors
Security notes: The endpoint verifies administrator role; exports use the same filters and a fixed timestamp boundary
Manual clear method: None
```

## Site settings (public and server)

Admin-editable settings (`admin_app_settings`: general, security, notifications, email, messaging) are validated by `src/lib/siteSettings.mjs` and read on the server through `src/lib/appSettingsServer.js`.

```text
Feature: Site settings (branding, contact, municipality info, password/session/lockout policy, notification and email switches)
Data fetched: admin_app_settings rows, resolved over defaults
Change frequency: Rare; only when an administrator saves Settings
Visibility: Public subset via GET /info/api/site-settings (name, logo, contact, municipality, password rules); everything else admin-only
Freshness: Applies on the next request on the saving server instance; other instances within 30 s; browsers within 60 s
Stale behavior: Server serves cached values for up to 30 s; public response may be up to 60 s old (+5 min stale-while-revalidate)
Missing-cache behavior: Read the row; a failed read falls back to the defaults (the pre-settings behaviour) and is not cached
Invalidation trigger: PUT /info/api/admin/settings calls invalidateAppSettings(id) after a successful write
Cache layer: Server memory per instance (Map, 30 s TTL); public HTTP cache (Cache-Control: public, max-age=60, stale-while-revalidate=300); client memory promise per page load (usePublicSettings)
Cache key: Settings id (server); request URL (HTTP)
TTL: 30 s server, 60 s public HTTP
Offline behavior: Public pages render with built-in defaults if the request fails
Security notes: No secrets are stored in settings (SendGrid key and verified sender stay in env vars). The public endpoint exposes only buildPublicSettings fields. Audit log records every save (security/notification/email values in full).
Manual clear method: Save the setting again (clears server cache); redeploy/restart clears all instances
```

## Admin reviews, inquiries and categories

```text
Feature: Tourism-office review replies, inquiry queue, listing and alert categories
Data fetched: attraction_ratings (+ office reply), info_inquiries, listing_categories, alert_categories
Change frequency: Several times a day
Visibility: Staff only (feedback.manage / tourism.manage / alerts.broadcast; category writes for alerts are admin-only)
Freshness: Fetched on every page visit and after each write
Stale behavior: None; no cache
Missing-cache behavior: Fetch from the admin API
Invalidation trigger: Not applicable (no cache); public review lists already refetch on each visit
Cache layer: None (Cache-Control: private, no-store)
Cache key: None
TTL: None
Offline behavior: Pages show a load error with Retry
Security notes: Service-role reads behind authorizeAdminApi; reviewer edits from the browser cannot change office_reply (trigger in migration 102)
Manual clear method: None needed
```

## Registered event calendar

The profile's conditional **Registered Events** tab displays the three most
recent confirmed registrations and links to the full calendar.

```text
Feature: Signed-in user's registered event calendar and profile recent registrations
Data fetched: Confirmed registrations, registration timestamps, and corresponding event dates, titles, locations, and status
Change frequency: Registration or cancellation, plus event schedule or status updates
Visibility: User-specific; only the signed-in user's registrations
Freshness: Fetch without cache when the calendar is opened or the profile tab is loaded
Stale behavior: Do not display stale registration or schedule data
Missing-cache behavior: Read from the session-authorized API and show a retryable error on failure
Invalidation trigger: None; no cache is populated, so the next visit reads current records
Cache layer: None; browser fetch and API response use no-store
Cache key: None
TTL: 0
Offline behavior: No stale calendar; retain the current screen and provide retry
Security notes: The server derives user_id from the signed session, queries only that user's confirmed registrations, and returns private, no-store responses
Manual clear method: None; there is no cache
```
