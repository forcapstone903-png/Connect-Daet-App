# Caching Standard

Caching is part of the feature design, not an afterthought. Any data read more than once must have an explicit cache strategy, TTL, invalidation rule, and security review.

## Current Implementation

The shared implementation is in `src/lib/cache.js`:

- Authenticated feed, profile, and notification data use a user-scoped in-memory TTL cache.
- Public tourist spot data uses a versioned `localStorage` cache with a one-day TTL and background revalidation.
- Public visitor review previews use the shared in-memory cache with a five-minute TTL and stale-while-revalidate behavior.
- Logout clears user-scoped memory entries.
- Profile, follow, reaction, save, and notification writes invalidate related memory entries.
- Persistent cache corruption, quota errors, and private browsing storage failures fall back to the network.

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

Do not move authenticated data into persistent browser storage without an explicit security review.

## Admin Weather

The admin dashboard requests current Daet weather and forecast data from the server endpoint. Current observations can affect visitor safety, so the endpoint bypasses caches and never substitutes estimated conditions when the provider is unavailable.

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
Security notes: OpenWeather credentials must be stored only in the server-side OPENWEATHER_API_KEY environment variable
Manual clear method: None
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
