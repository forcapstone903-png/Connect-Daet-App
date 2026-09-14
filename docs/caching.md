# Caching Standard

Caching is part of the feature design, not an afterthought. Any data read more than once must have an explicit cache strategy, TTL, invalidation rule, and security review.

## Current Implementation

The shared implementation is in `src/lib/cache.js`:

- Authenticated feed, profile, and notification data use a user-scoped in-memory TTL cache.
- Public tourist spot data uses a versioned `localStorage` cache with a one-day TTL and background revalidation.
- Logout clears user-scoped memory entries.
- Profile, follow, reaction, save, and notification writes invalidate related memory entries.
- Persistent cache corruption, quota errors, and private browsing storage failures fall back to the network.

Do not move authenticated data into persistent browser storage without an explicit security review.

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
