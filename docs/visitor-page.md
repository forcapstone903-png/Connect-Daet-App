# Visitor data and scroll effects

The visitor queries use existing blog likes/comment counts and forum reply counts, not nonexistent share/bookmark counters. Failed queries surface the existing refresh banner. The visitor page shows the latest published stories and recently active published discussions returned under database RLS, with no minimum engagement requirement or author-profile lookups. No database migrations are required by this fix.

Cards marked `data-scroll-card` fade and rise based on viewport position. The wrapper observes asynchronously inserted cards and category changes. It batches geometry reads and style writes in requestAnimationFrame, removes listeners on unmount, and respects OS/app reduced motion and keyboard focus. Hero and emergency content are not animated. No dependencies or permanent diagnostic/test files were added.

## Cache decision

Feature: Visitor query compatibility and card animation
Data fetched: Active destinations, published stories/discussions/events, unexpired announcements and summary counts
Change frequency: On publication, moderation and engagement writes
Visibility: Public content selected under existing database RLS
Freshness: Fresh request on each page mount
Stale behavior: No cross-visit snapshots; mounted content remains until refresh
Missing-cache behavior: Loading state, then live data or refresh/error banner
Invalidation trigger: Reload/remount; this page does not perform content writes
Cache layer: Component memory only; no new shared/persistent cache
Cache key: Visitor component instance and its query/filter state
TTL: Component lifetime; discarded on unmount
Offline behavior: No cached offline snapshot; show loading failure rather than fabricated records
Security notes: Never cache auth tokens or user profile records in public storage
Manual clear method: Refresh the page

The absence of a reusable cache is intentional for this compatibility fix: existing visibility decisions remain network-backed and failures are not persisted. Animation stores only transient element positions, not content.
