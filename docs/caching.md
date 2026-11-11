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

## Visitor Review Preview

The public visitor page may show the latest published attraction reviews when review text is available.

```text
Feature: Public visitor review preview
Data fetched: Public tourist-spot review text, rating, date, and public reviewer name/avatar
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
Security notes: Only public review fields are selected; authenticated actions and user-specific votes are not cached
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
Data fetched: Database-derived rating average/count/breakdown, one sorted review page, public reviewer fields, and the authenticated viewer's own review/helpful votes
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
Data fetched: Open reports, active publishing restrictions, and moderation audit entries
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
Security notes: Reporter identity is derived from the signed-in server session; publishing restrictions are enforced by database triggers and authenticated APIs
Manual clear method: None; reload moderation data

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
the admin table, moderation history, and author submission list do not retain
client or persistent snapshots.

```text
Feature: Blog moderation and author submission status
Data fetched: Blog content and author details for admins; approval status and rejection feedback for the owning author
Change frequency: Changes whenever an author submits or edits a post, or an administrator reviews it
Visibility: Admin-only moderation data; owner-only submissions and feedback; public blog data is approved-only
Freshness: Fetch on page load and after every successful moderation action
Stale behavior: Do not show stale status or moderation history
Missing-cache behavior: No cache; display the API error and allow a fresh retry
Invalidation trigger: No cache; reload the affected list after a successful write
Cache layer: None
Cache key: None
TTL: None
Offline behavior: Keep no fabricated status; surface the load error and retry when online
Security notes: Admin endpoints authorize the signed server session; owner endpoints scope records to the session user; public queries and RLS require approved status
Manual clear method: None; reload the moderation or submissions page
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
