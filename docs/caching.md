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

The shared event detail page caches only the public event fields needed to render
the editorial page, its organizer's public profile fields, and related-event
previews. Event ticket pricing/capacity, authenticated reactions, bookmarks,
repost state, and comments are not cached.

```text
Feature: Public event details
Data fetched: Public event description, location, dates, status, participant count, cover media, public organizer name/avatar, and related event previews
Change frequency: Administrator controlled; expected to be occasional
Visibility: Public event and public profile fields; viewer-specific actions excluded
Freshness: Two minutes
Stale behavior: Keep the last valid event details visible while revalidating; show a refresh notice on failure
Missing-cache behavior: Fetch on first load; show the existing retryable page error if offline
Invalidation trigger: Two-minute TTL; invalidate the event key when explicitly clearing cached event details
Cache layer: In-memory
Cache key: event:public:detail:{eventId}
TTL: 2 minutes
Offline behavior: Use stale in-memory public details if available; otherwise surface the fetch error without placeholder data
Security notes: Select only public detail fields; do not cache ticket, payment, authentication, bookmark, reaction, or comment data
Manual clear method: invalidateCache(getCacheKey('event', 'public', 'detail', eventId))
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
