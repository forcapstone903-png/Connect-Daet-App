# Push notification setup

## VAPID keys

Generate a key pair locally:

```bash
npx web-push generate-vapid-keys
```

Put the public key in the React environment file used by Next.js, such as `.env.local`:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-generated-public-key
```

Do not put the private key in a `NEXT_PUBLIC_*` variable or commit it. Store it as an Edge Function secret:

```bash
supabase secrets set \
  VAPID_PRIVATE_KEY="your-generated-private-key" \
  VAPID_SUBJECT="mailto:admin@example.com"
```

The public key is also required by the Edge Function to configure `web-push`:

```bash
supabase secrets set VAPID_PUBLIC_KEY="your-generated-public-key"
```

Deploy the function:

```bash
supabase functions deploy push
```

## Database webhook

Create a Supabase Database Webhook for:

- Schema: `public`
- Table: `notifications`
- Event: `INSERT`
- Webhook URL: `https://<project-ref>.supabase.co/functions/v1/push`
- Method: `POST`
- Headers: `Authorization: Bearer <function-or-service-token>` and `Content-Type: application/json`

The webhook payload should contain the inserted record, including `user_id`, `title`, `body`, `url`, and optional `payload` JSON.

Apply the migration before creating the webhook:

```bash
supabase db push
```

The service worker displays `title`, `body`, `icon`, and `badge`, then opens `url` when the user clicks the notification. iOS users must install the site to the Home Screen and enable notifications from the installed app in a user gesture.
