# Release checklist

All gates start unchecked. Replace `Owner` and `Verified by / date` only after external evidence is available.

| Gate | Owner | Verified by / date |
|---|---|---|
| [ ] Migration `118` and remote-only `147`-`152` history reconciled | | |
| [ ] Migration `080`/`081` pair and ten empty migrations disposition approved | | |
| [ ] Staging migration and RLS catalog comparison completed | | |
| [ ] Production Supabase URL, anon key, service-role key, and key scopes verified | | |
| [ ] Dedicated `SESSION_SECRET` configured with at least 32 bytes and rollout impact reviewed | | |
| [ ] Existing sessions impact explicitly accepted; fallback warning verified | | |
| [ ] `CRON_SECRET` configured for all scheduled routes | | |
| [ ] SendGrid credentials and sender/domain verified | | |
| [ ] VAPID public/private key pair and push subject verified | | |
| [ ] Moderation, GIF, weather, geocoding, and site URL providers configured as appropriate | | |
| [ ] Hosted Supabase Auth callback allowlist and SMTP verified | | |
| [ ] Vercel project, domain, build settings, environment scopes, and deployment branch verified | | |
| [ ] Vercel cron execution history verified | | |
| [ ] Recent backup run verified | | |
| [ ] `admin-backups` bucket confirmed private | | |
| [ ] Disposable staging restore drill completed | | |
| [ ] Managed Supabase backup and retention plan verified | | |
| [ ] Error tracking configured and tested | | |
| [ ] Uptime checks configured and tested | | |
| [ ] Slow-query alerts configured and thresholds reviewed | | |
| [ ] Failed-auth alerts configured and tested | | |
| [ ] Realtime health checks configured and tested | | |
| [ ] RLS role matrix passed in staging | | |
| [ ] Pagination behavior passed in staging | | |
| [ ] Realtime create/update/delete behavior passed in staging | | |
| [ ] Activity-tracking idempotency passed in staging | | |
| [ ] Public page smoke tests pass against the release build | | |
| [ ] Protected API 401 smoke tests pass | | |
| [ ] Tourist detail data request result verified; no unresolved loading state | | |
| [ ] Full lint passes without errors | | |
| [ ] Tests pass | | |
| [ ] Production build passes | | |
| [ ] `git diff --check` passes | | |
