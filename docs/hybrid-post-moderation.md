# Hybrid blog post moderation

The blog submission API stores a submission as unpublished, claims it once in
the database, evaluates it on the server, and then either publishes it or
leaves it in the existing administrator queue. Apply
`supabase/migrations/127_hybrid_blog_moderation.sql` before deploying the
updated application.

## Screening and publication

The risk score (0–100) combines configured language terms, suspicious or
excessive links, near-duplicate content, recent submission volume, unresolved
community reports, previous rejections, and recorded moderation violations.
Critical threat signals are always priority-review signals. A score below 30
alone never publishes a post: every check must pass and the author must satisfy
the current account-age, prior-approval, rejection, violation, report, and
posting-rate requirements.

Auto-publishing is disabled by default. An administrator can enable it and set
the trust requirements under **Admin → Moderation → Reports → Low-risk
auto-publishing**. Posts that do not qualify remain unpublished for review.
Failed checks are recorded as failed and also remain unpublished.

Text screening uses the saved moderation terms plus content, duplication,
activity, account-history, and report signals. Media is never auto-published
unless a media scanner is configured and returns a valid safe result. Without a
scanner, submissions containing images or videos stay in the review queue.

## Optional media scanner

Configure these server-only environment variables to use a trusted scanner:

- `CONTENT_MODERATION_API_URL`: HTTPS endpoint for the scanner.
- `CONTENT_MODERATION_API_KEY`: bearer token for that endpoint.

The application sends a JSON `POST` with `title`, plain-text `text`, and a
`media` array containing `{ "url": "...", "kind": "image" | "video" }`. The
scanner must return JSON in this shape:

```json
{
  "safe": true,
  "score": 0,
  "flags": [],
  "critical": false,
  "reason": ""
}
```

`safe` must be a boolean, `score` must be a number from 0 to 100, and `flags`
must be an array of strings. Invalid responses, timeouts, and HTTP errors fail
closed. Configure only a scanner approved for the application's content and
privacy requirements; when enabled, post text and media URLs are sent to that
endpoint.

## Audit and privacy

`blog_moderation_logs` records automated and manual decisions. The moderation
service uses service-role-only RPCs and the metadata guard prevents ordinary
users from changing scores, decisions, or review records. Existing blog
approval RPCs remain the administrator decision path.

```text
Feature: Hybrid blog post moderation queue
Data fetched: Private post submissions, author moderation history, reports, and saved policy settings
Change frequency: Changes on each submission, report, or moderation decision
Visibility: Private; submission visibility follows existing blog RLS and the queue is administrator/moderator-only
Freshness: Fetch at submission and queue load; no realtime subscription is added
Stale behavior: Do not use cached risk or status; keep failed checks unpublished
Missing-cache behavior: No cache; read current records from Supabase
Invalidation trigger: No cache; submission and review actions request fresh server data
Cache layer: None
Cache key: None
TTL: None; endpoints are private and no-store
Offline behavior: No offline moderation; the database record remains unpublished and awaiting review
Security notes: Service-role-only moderation writes/logs; media scanning is an explicit server-side integration
Manual clear method: None; reload the queue to retrieve current records
```
