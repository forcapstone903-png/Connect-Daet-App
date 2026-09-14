# Web Push setup for React + Vite + Supabase

This repository is currently Next.js, so it does not have a Vite `main.jsx`. The existing registration point is `src/components/PwaInstaller.js`. For a separate React + Vite app, register the worker once in `src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Register once on app startup. Without this, navigator.serviceWorker.ready
// never resolves and push subscription waits forever.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => {
    console.error('Service worker registration failed:', error)
  })
}
```

Use the reusable component at `src/components/EnableNotificationsButton.js` and set the Vite public variable:

```env
VITE_VAPID_PUBLIC_KEY=your-generated-public-key
```

The subscription utility also accepts the existing Next.js fallback variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## Migrations

The migrations are split by responsibility:

- `supabase/migrations/037_push_notifications.sql` creates `public.push_subscriptions`.
- `supabase/migrations/038_notifications.sql` creates `public.notifications`.
- `supabase/migrations/039_push_notifications_webhook.sql` creates the trigger.
- `supabase/migrations/040_info_notifications_push_bridge.sql` bridges the app's
  `public.info_notifications` rows into the push queue.

Before applying `039`, replace:

- `YOUR_PROJECT_REF` with the Supabase project reference.
- `REPLACE_WITH_WEBHOOK_SECRET_OR_ANON_KEY` with the credential accepted by the `push` function.

Keep credentials out of source control when possible. A safer alternative is to deploy the function with JWT verification disabled and validate a dedicated secret header inside the function using an Edge Function secret.

## Commands

Create the migrations through the CLI:

```bash
supabase migration new create_push_subscriptions
supabase migration new create_notifications
supabase migration new push_notifications_webhook
```

The generated timestamp prefixes may differ from this repository's `037`, `038`,
and `039` filenames. Keep the migrations ordered so the trigger is created after
both tables.

Apply local or linked migrations:

```bash
supabase db push
```

For a local database, apply pending migrations with:

```bash
supabase migration up
```

Set the Edge Function secrets separately from the public Vite key:

```bash
supabase secrets set VAPID_PRIVATE_KEY="your-private-key" VAPID_SUBJECT="mailto:admin@example.com"
```

Verify the tables, policies, and trigger:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('push_subscriptions', 'notifications');

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('push_subscriptions', 'notifications')
order by tablename, policyname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname = 'notifications';
```

## Creating a notification

Insert a row using a trusted server or Edge Function context:

```sql
insert into public.notifications (user_id, title, body, url)
values (
  'USER_UUID',
  'New update',
  'There is a new update for you.',
  '/user/notifications'
);
```

The trigger sends `record.user_id`, `record.title`, `record.body`, and `record.url` to `push`. The Edge Function then loads that user's subscriptions and sends the Web Push payload.

## Verification and debugging

Tail the deployed Edge Function logs:

```bash
supabase functions logs push --project-ref YOUR_PROJECT_REF
```

Verify the trigger through `pg_trigger`:

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname = 'notifications';
```

Verify the SQL-standard trigger view:

```sql
select trigger_schema, event_object_schema, event_object_table,
       trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'notifications';

select trigger_schema, event_object_schema, event_object_table,
       trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table = 'info_notifications';
```

Manually invoke the Edge Function. Use a function token accepted by your deployed function:

```bash
curl -i -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/push" `
  -H "Authorization: Bearer YOUR_FUNCTION_TOKEN" `
  -H "Content-Type: application/json" `
  --data '{"record":{"user_id":"YOUR_AUTH_USER_UUID","title":"Manual push test","body":"Edge Function received the test payload.","url":"/user/notifications"}}'
```

Insert a test notification from a trusted SQL session and watch the function logs:

```sql
insert into public.notifications (user_id, title, body, url)
values (
  'YOUR_AUTH_USER_UUID',
  'Database webhook test',
  'This row should trigger the push function.',
  '/user/notifications'
);
```

Common webhook failure causes:

- `039_push_notifications_webhook.sql` still contains placeholder project URL or token.
- `pg_net` is not enabled or the function lacks permission to call `supabase_functions.http_request`.
- The trigger is attached to a different schema/table, or the migration was not pushed.
- The request URL does not match the deployed function name `push`.
- The function JWT setting does not match the `Authorization` header sent by the trigger.
- `notifications.user_id` does not match any row in `push_subscriptions`.
- The Edge Function service-role secret is missing or incorrect.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, or `VAPID_SUBJECT` is missing or the public/private pair does not match.
- The client subscription was never saved, the browser permission is denied, or the subscription endpoint has expired.

For the browser console, successful setup logs appear as:

```text
[push] Requesting notification permission
[push] Notification permission: granted
[push] Waiting for navigator.serviceWorker.ready
[push] Push subscription created: https://...
[push] Subscription saved successfully
```
