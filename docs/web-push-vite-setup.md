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
