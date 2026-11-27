# Staging test plan

All checks require disposable staging accounts and data. Do not use production credentials or write to production.

## Role matrix

| Finding | anon | user | owner | moderator | tourism officer | admin | service-role |
|---|---|---|---|---|---|---|---|
| Profiles projection | Public safe fields only; no private address/location/phone or privacy fields | Own private fields; public fields for others as contract specifies | Own full approved fields | As user plus approved moderation needs | As user plus tourism scope | As admin contract specifies | Server route only; RLS bypass requires route authorization |
| `content_shares` | No DM metadata or recipient/caption data unless product intentionally allows | Own outgoing/incoming records only | Owner records and intentionally visible shared metadata | Moderation scope only | Tourism scope only | Approved admin scope | Server route only; route must retain authorization |
| Vote tables | No raw voter IDs or hidden response data | Own vote row; aggregate visibility according to poll | Poll owner only according to visibility design | Moderation scope only | Tourism scope if content-owned | Approved admin scope | Server route only |
| Generic interaction tables | Public aggregates or approved public fields only; no unintended raw actor metadata | Own and public-permitted records | Own content and approved moderation actions | Moderation scope only | Tourism scope only | Approved admin scope | Server route only |

The matrix is an acceptance checklist, not a policy relaxation.

## API and UI checks

1. Verify direct REST/table reads for each role.
2. Verify route/session authorization where service-role credentials are used.
3. Confirm no response shape or status-code changes.
4. Test first page and subsequent pages for feed, followers, messages, notifications, comments, tourist listings, and search.
5. Verify stable ordering and cursor/non-duplicate/non-skipped behavior.
6. Test an empty page, last page, concurrent insert, and concurrent delete.

## Realtime verification

For create, update, and delete events, verify:

- Sender and authorized subscribers receive the expected payload.
- Unauthorized subscribers receive no private row data.
- UI state updates once and does not duplicate rows.
- A disconnected/reconnected client catches up correctly.
- Create/update/delete events respect RLS and route permissions.

## Activity-tracking idempotency design

Activity writes should use an explicit activity key or database uniqueness rule, retain a canonical activity type/entity pair, and accept repeated API calls without duplicate rows or inflated analytics.

Staging acceptance:

- Repeated identical impressions, reactions, and views do not multiply aggregates.
- Retry after timeout returns the same logical result.
- Concurrent requests produce one logical activity row.
- Content update/delete does not bypass cleanup or access rules.
- Rollup values reconcile with raw activity rows.
