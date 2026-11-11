# Site visit analytics

The admin analytics dashboard reports page views, estimated unique visitors, daily totals, and the most-viewed public tourism pages for the latest 30 days.

## What is counted

- The tracker records visits to public visitor, search, tourist-spot, event, blog, and forum pages.
- User/admin/authentication routes, API paths, query strings, and fragments are excluded.
- Analytics is disabled until the visitor chooses **Accept all** in the cookie notice.
- A random browser ID is retained in local storage for up to 30 days. The browser sends the ID only with an approved public page path and only while consent is granted.
- For anonymous page views, the server stores a one-way SHA-256 hash of the browser ID, normalized public path, and visit timestamp. For signed-in tourist-spot detail views, it uses a server-keyed one-way account hash instead. It does not store raw IDs, IP addresses, user-agents, referrers, email addresses, or query strings.
- Signed-in tourist-spot views are recorded in a separate deduplication table. A spot counts each account once during the rolling 90-day retention window; anonymous browser views do not increase the tourist-spot account count.
- Repeated requests for the same visitor and page within 10 seconds are deduplicated.
- “Unique visitors” means distinct consented browser IDs during the selected period; it is an estimate, not a count of verified people. Cleared storage, different browsers/devices, denied consent, and automation affect the result.
- Analytics records and tourist-spot account-deduplication rows should be retained for no more than 90 days.

## Deployment

1. Review and apply `supabase/migrations/062_site_visit_analytics.sql` to the target database.
2. Ensure the application server has the Supabase URL and service-role key. The key must remain server-side.
3. Configure a daily Supabase scheduled job to call `public.cleanup_site_page_views()` so records older than 90 days are removed. Confirm the job is enabled and monitor failures; the migration does not enable `pg_cron` automatically.
4. Open `/info/admin/analytics` with an admin account and verify the 30-day totals, daily chart, and popular pages.
5. Test consent accepted, consent denied, consent withdrawal, private-route exclusion, duplicate navigation, one account revisiting the same spot, and the same-origin ingest endpoint.

Migration history alone does not mean this database has applied the migration. Until the migration is applied and the scheduled cleanup is configured, the dashboard will return a visible error or data may outlive the intended retention period.

## Cache decision

```text
Feature: Site visit statistics
Data fetched: Aggregated page-view counts, estimated unique consented browsers, and public page paths
Change frequency: On consented public page visits
Visibility: Aggregated administrator-only; raw event rows are server-only
Freshness: Current at request time
Stale behavior: No stale statistics presented
Missing-cache behavior: Show an explicit error or empty period; never use generated values
Invalidation trigger: None; the read is uncached and reflects recorded events
Cache layer: None
Cache key: None
TTL: None; GET responses use private, no-store
Offline behavior: No offline analytics; page viewing continues without recording if the API is unavailable
Security notes: Consent-gated first-party random ID; only SHA-256 or server-keyed account hashes, public route paths, and timestamps are stored; admin GET uses a signed server session; API database access uses server-only service role
Manual clear method: Withdraw consent and clear local storage to remove the browser ID; use the scheduled cleanup function for server records and deduplication rows older than 90 days
```
