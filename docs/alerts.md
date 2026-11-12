# Real-time alerts setup

The alert feature requires the database schema, a deployed push Edge Function,
matching webhook secrets, and VAPID keys. Do not commit any secret values.

## Database

Apply `supabase/migrations/098_realtime_alerts.sql` through the project's
approved Supabase migration workflow. The migration creates alert categories,
alert and template tables, user preferences, inbox delivery functions, RLS
policies, and the scheduled-delivery job when `pg_cron` is available.

The migration does not configure push credentials. Without the Vault secrets
below, alerts still create in-app notification inbox entries, but push delivery
is skipped.

## Push delivery

1. Generate a VAPID key pair for the deployment. Set the public key as
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the web app and set `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as Supabase Edge Function secrets.
   Use a `mailto:` subject identifying the system operator.
2. Generate a random webhook secret with at least 32 characters. Set it as
   `PUSH_WEBHOOK_SECRET` for the Edge Function.
3. Deploy the `push` function with JWT verification disabled; it authenticates
   database calls using the webhook secret instead:

   ```powershell
   supabase functions deploy push --no-verify-jwt
   ```

4. Store the function URL and the *same* webhook secret in Supabase Vault using
   the Supabase SQL editor or another approved secret-management workflow:

   ```sql
   select vault.create_secret(
     'https://<project-ref>.supabase.co/functions/v1/push',
     'push_function_url'
   );
   select vault.create_secret('<same-random-secret>', 'push_webhook_secret');
   ```

   Never put real secret values in source control, application logs, or this
   document. Rotate the Edge Function and Vault copies together.

## Scheduled delivery

Migration 098 attempts to schedule `deliver_due_alerts()` every minute with
`pg_cron`. Verify that the job exists in the target Supabase database.

If `pg_cron` is unavailable, configure an external scheduler to call
`GET /info/api/cron/alerts` with `Authorization: Bearer <CRON_SECRET>`.
`CRON_SECRET` must be at least 32 characters and configured in the web app
deployment. The route is a fallback endpoint; it is not currently listed as a
Vercel Cron job in `vercel.json`.

## Safe verification

Test end-to-end delivery only in a non-production Supabase project with a
dedicated test account and browser subscription. Sending an alert creates
inbox notifications for its selected audience and can send real push
notifications to every matching subscribed device.

Verify the alert appears in the public feed, its inbox reach is recorded, and
the alert's push counters reach a completed state. Also test scheduling,
cancellation, all-clear, and guest unsubscribe in that non-production project.
