# Tourism and Discover Daet — Phase 8

## Scope and baseline

This phase reviewed the visitor destination homepage, tourist-spot directory
and detail page, map links, and tourist-spot review flow. The working tree
contained changes from earlier phases and user work; those changes were left
untouched.

The shared browser page was unavailable, so no browser Network inspection,
Core Web Vitals, query timings, or before/after performance measurements could
be collected. No quantitative speedup is claimed. No database connection or
migration was used.

## Existing capabilities verified

- The directory already supports text search, category and barangay filters,
  rating filtering, and sorting. Its public listings cache is versioned and
  was left unchanged.
- Destination details use stored coordinates only after validating their
  ranges; otherwise the map destination falls back to the stored address.
  No coordinates or destination details were fabricated.
- The detail page already displays destination information and lazy-loads
  gallery images and its map embed.
- Tourist-spot reviews are paginated. The UI requires review text and permits
  either no star rating or a rating from 1 to 5.

## Change made

The location section had both “Open in Maps” and “Open in Google Maps” links,
but both generated the same Google Maps search URL from the same destination.
Removed the redundant link; retained “Open in Maps” and the distinct
“Get directions” action. Targeted lint also exposed a missing `MessageCircle`
icon import for the existing comments action in this same page; the import is
now present so that interaction can render correctly.

## Review authorization and duplicate prevention

Static inspection of the checked-in migrations and review component found:

- The component submits reviews with the signed-in user ID and upserts on
  `(user_id, attraction_type, attraction_id)`.
- Migration `004_social_features.sql` defines public review reads and insert
  and update policies that require `auth.uid() = user_id`.
- Migration `068_tourist_spot_ratings_reviews.sql` adds an owner-only delete
  policy and a non-empty review-text check for tourist-spot reviews.
- Migration `120_one_rating_per_user_per_attraction.sql` restores a unique
  constraint on `(user_id, attraction_type, attraction_id)`, preventing
  multiple reviews for the same attraction by one user. Migration
  `121_optional_tourist_spot_rating_or_review.sql` allows a text-only review
  by making the rating nullable.

These are source-migration findings, not confirmation of the live Supabase
catalog or deployed RLS state. Do not apply or alter migrations as part of this
phase; reconcile the migration-history discrepancy documented in
`DATABASE_OPTIMIZATION_REPORT.md` and verify on a non-production project
before any database changes.

## Files changed

- `src/app/(subsystems)/info/visitor/tourist-spots/[id]/page.js` — removed
  one identical map link and restored the existing comments action's icon
  import.
- `TOURISM_DISCOVERY_REPORT.md` — recorded findings, scope, and verification
  limitations.

No files were removed. No cache, migration, API, or database changes were
made.

## Verification and remaining risks

- `npm.cmd test`: 270 tests passed, 0 failed.
- `npm.cmd run lint -- "src/app/(subsystems)/info/visitor/tourist-spots/[id]/page.js"`:
  passed with 0 errors and 6 existing `@next/next/no-img-element` warnings.
- `npm.cmd run build`: passed after the final code edits.
- `git diff --check`: passed.

The map and review flows could not be exercised in a live browser. Live RLS
and migration deployment state remain unverified.

## Suggested next phase

Use an authenticated staging environment to exercise map navigation and
review create/update/delete flows for multiple roles. Capture browser network
and performance measurements before choosing any larger tourism-page,
image, query, or caching changes.
