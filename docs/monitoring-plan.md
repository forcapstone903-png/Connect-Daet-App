# Monitoring plan

These are recommendations only. No monitoring dependency or service integration is added by this plan.

## Error tracking

- Add a privacy-reviewed server/browser error tracker.
- Capture route name, status family, release, environment, and sanitized stack/error category.
- Redact cookies, authorization headers, email addresses, session IDs, provider keys, and database payloads.
- Alert on new or materially elevated error rates by route and environment.

## Uptime

- Probe public visitor home, tourist directory, login, and a read-only health endpoint if product-approved.
- Use at least two regions when the provider is available.
- Alert after repeated failures; page the owner outside the normal alert window.

## Slow-query alerts

- Enable Supabase/Postgres slow-query or statement statistics monitoring.
- Create thresholds for p95/p99 latency and query duration after measuring representative staging traffic.
- Alert on sustained degradation rather than a single cold request.
- Include migration, table, endpoint, and deployment metadata in investigations.

## Failed-auth alerts

- Alert on elevated login failure rates, lockout activation, password-reset abuse, and invalid session/tampering spikes.
- Track by route and coarse IP/account-risk aggregate without retaining unnecessary personal data.
- Alert on cron or service-role authentication failures.

## Realtime health

- Monitor channel connection failures, subscription gaps, reconnect storms, and publish acknowledgements.
- Verify create/update/delete delivery against staging.
- Alert on sustained no-event or replay/duplicate anomalies.

## Escalation

- Release owner: migration and production environment.
- Database owner: query, RLS, backups, restore.
- Application owner: routes, auth, Realtime.
- Operations owner: uptime, error tracking, notifications.
