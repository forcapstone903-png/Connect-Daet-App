# Daet Connect — Appendix Source Code Excerpts

This appendix presents short, logic-focused excerpts from the implemented source code. Full behavior should be read with the linked source file.

## Appendix A — Database Connection and Supabase Client Configuration

**Technology:** JavaScript, Supabase

```javascript
const DEFAULT_PRODUCTION_APP_URL = 'https://connect-daet-app.vercel.app'

export function getAppUrl(request) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const fallbackUrl = process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_APP_URL
    : new URL(request.url).origin
  const appUrl = new URL(configuredUrl || fallbackUrl)

  if (appUrl.protocol !== 'http:' && appUrl.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.')
  }
  return appUrl.origin
}

export function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) return { url: null, key: null, source: null }

  return serviceRoleKey
    ? { url, key: serviceRoleKey, source: 'service_role' }
    : { url, key: anonKey || null, source: anonKey ? 'anon' : null }
}
```

**Source:** [src/lib/supabaseConfig.js](../src/lib/supabaseConfig.js)

## Appendix B — User Registration and Authentication

**Technology:** Next.js, Supabase

```javascript
const supabase = createClient(supabaseUrl, supabaseAuthKey)
const { data: authData, error } = await supabase.auth.signUp({
  email: normalizedEmail,
  password,
  options: {
    data: { full_name: full_name || '', user_type: 'tourist' },
    emailRedirectTo: `${appUrl}/info/confirm`,
  },
})

const hashedPassword = await bcrypt.hash(password, 12)
await adminSupabase.from('info_users').upsert({
  id: authData.user.id,
  email: normalizedEmail,
  full_name: full_name,
  user_type: 'tourist',
  password: hashedPassword,
})
```

```javascript
const { data: authData, error } = await supabase.auth.signInWithPassword({
  email: normalizedEmail,
  password,
})

setSecureSessionCookie(response, userProfile, rememberMe, sessionVersion, null, {
  perms: effectiveOverrides,
  idleSeconds,
})
```

**Sources:** [register route](../src/app/(subsystems)/info/api/register/route.js), [login route](../src/app/(subsystems)/info/api/login/route.js), [server authentication](../src/lib/serverAuth.js)

## Appendix C — User Role and Access Control

**Technology:** JavaScript, Supabase

```javascript
export const PERMISSIONS = Object.freeze({
  'console.access': ['tourism_officer', 'moderator'],
  'moderation.manage': ['moderator'],
  'forum.manage': ['moderator'],
  'users.view': ['moderator'],
  'users.manage': [],
  'system.manage': [],
})

export function getAdminAuthorizationStatus(session, pathname, method) {
  if (!session?.user_id) return 401
  if (!isStaffRole(session.role)) return 403
  if (!pathname) {
    return hasPermission(session.role, 'system.manage', session.perms) ? null : 403
  }
  return canAccessAdminApi(session.role, pathname, method, session.perms) ? null : 403
}
```

**Sources:** [staff role rules](../src/lib/staffRoles.mjs), [admin authorization policy](../src/lib/adminRolePolicy.mjs)

## Appendix D — Tourism Destination Management

**Technology:** Next.js, Supabase

```javascript
const ids = [...new Set(Array.isArray(body?.ids) ? body.ids : [])]
if (!ids.length || ids.length > 200) {
  return json({ success: false, message: 'Select between 1 and 200 listings.' }, 400)
}

const { data, error } = await adminSupabase
  .from('info_tourist_spots')
  .update({ ...changes, updated_at: new Date().toISOString() })
  .in('id', ids)
  .select('id')
```

**Source:** [tourist spot API](../src/app/(subsystems)/info/api/admin/tourist-spots/route.js)

## Appendix E — Tourism Events Management

**Technology:** Next.js, Supabase

```javascript
const [total, pending, approved, rejected] = await Promise.all(
  ['all', 'pending', 'approved', 'rejected'].map(async (status) => {
    let query = client
      .from('info_events')
      .select('id', { count: 'exact', head: true })

    if (status !== 'all') query = query.eq('approval_status', status)
    if (status === 'approved') query = query.eq('status', 'published')
    const { count, error } = await query
    if (error) throw error
    return count || 0
  })
)
```

**Source:** [event moderation API](../src/app/(subsystems)/info/api/admin/events/route.js)

## Appendix F — Blog and Community Post Management

**Technology:** Next.js, Supabase

```javascript
const restriction = await getActivePublishingRestriction(adminSupabase, userId)
if (restriction) {
  return NextResponse.json(
    { success: false, message: 'Your account is currently restricted from submitting posts.' },
    { status: 403 }
  )
}

const basePayload = {
  status: 'draft',
  approval_status: body.status === 'published' ? 'pending' : 'draft',
  submitted_at: body.status === 'published' ? new Date().toISOString() : null,
  created_by: userId,
}
```

**Sources:** [blog submission API](../src/app/(subsystems)/info/api/user/blogs/route.js), [blog update API](../src/app/(subsystems)/info/api/user/blogs/[id]/route.js)

## Appendix G — Forum and Discussion Management

**Technology:** Next.js, Supabase

```javascript
const isModerator = ['admin', 'administrator', 'moderator'].includes(
  String(session.role || '').trim().toLowerCase()
)

const payload = {
  thread_id: threadId,
  user_id: session.user_id,
  content,
  status: isModerator ? 'active' : 'pending',
  parent_reply_id: resolvedParentId,
}
```

```javascript
const replyInsert = await adminSupabase
  .from('forum_replies')
  .insert(payload)
  .select(REPLY_SELECT)
  .single()
```

**Sources:** [forum topic API](../src/app/(subsystems)/info/api/posts/route.js), [forum reply API](../src/app/(subsystems)/info/api/forum-replies/route.js)

## Appendix H — Content Moderation and Post Approval

**Technology:** JavaScript, Supabase

```sql
IF TG_OP = 'INSERT' THEN
  IF TG_TABLE_NAME IN ('info_user_posts', 'forum_threads')
     AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
  RETURN NEW;
END IF;
```

```sql
IF content_changed OR OLD.status IS DISTINCT FROM NEW.status THEN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  NEW.status := 'pending';
END IF;
```

**Source:** [database moderation workflow](../supabase/migrations/101_moderator_workflows.sql)

## Appendix I — Trust-Based User Moderation

**Technology:** JavaScript, Supabase

The trust-level implementation is not yet present in the current source. The existing system uses role and moderation status rather than an account trust level.

```javascript
const isModerator = ['admin', 'administrator', 'moderator'].includes(
  String(session.role || '').trim().toLowerCase()
)

const status = isModerator ? 'published' : 'pending'
```

```sql
IF auth.uid() IS NOT NULL
   AND NOT public.is_admin(auth.uid())
   AND NOT public.is_moderator(auth.uid())
   AND (NEW.status = 'published' OR NEW.approval_status = 'approved') THEN
  NEW.status := 'draft';
  NEW.approval_status := 'pending';
END IF;
```

These excerpts show the current moderation boundary. Trust levels should reuse the moderation queue and audit log when implemented.

**Sources:** [forum submission API](../src/app/(subsystems)/info/api/posts/route.js), [database publication hold](../supabase/migrations/101_moderator_workflows.sql)

## Appendix J — Real-Time Notification System

**Technology:** JavaScript, Supabase

```javascript
channel = supabase
  .channel(`staff-notification-widget-${userId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'info_notifications',
    filter: `user_id=eq.${userId}`,
  }, () => {
    void loadNotifications()
  })
```

```javascript
await db.from('info_notifications').insert(
  staffIds.map((userId) => ({
    user_id: userId,
    title,
    message,
    type,
    is_read: false,
  }))
)
```

**Sources:** [floating staff notification widget](../src/app/(subsystems)/info/components/StaffNotificationWidget.js), [staff notification delivery](../src/lib/adminNotifications.js)

## Appendix K — Profanity Detection and Content Filtering

**Technology:** JavaScript

```javascript
function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[0-9]/g, (digit) => NUMBER_SUBSTITUTIONS[digit])
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/(\p{L})\1+/gu, '$1')
}

export function findProfanityMatches(text, terms) {
  const tokens = String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizeWord(token))

  return normalizeProfanityTerms(terms).filter((term) =>
    tokens.includes(term)
  )
}
```

**Sources:** [profanity filter](../src/lib/profanityFilter.mjs), [filter settings UI](../src/app/(subsystems)/info/admin/moderation/page.js)

## Appendix L — User Reporting and Content Removal

**Technology:** Next.js, Supabase

```javascript
const { data, error } = await client
  .from('info_moderation')
  .insert({
    report_type: reportType,
    reason,
    description: description || null,
    severity: 'medium',
    reported_by: reporterId,
    reported_user_id: reportedUserId,
    reported_item_id: itemId,
    reported_item_table: tableName,
    status: 'pending',
  })
```

```javascript
await writeAudit(client, actorId, action, 'info_users', userId, {
  reason,
  reportId,
})
```

**Sources:** [content reporting API](../src/app/(subsystems)/info/api/reports/route.js), [moderation actions API](../src/app/(subsystems)/info/api/admin/moderation/route.js)

## Appendix M — Responsive User Interface Implementation

**Technology:** Tailwind CSS

```jsx
<section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <h2 className="text-lg font-semibold text-gray-800">
    Profanity filter
  </h2>
</section>
```

```jsx
<div className="mb-5 flex items-end justify-between gap-4">
  <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
    {title}
  </h2>
</div>
```

**Sources:** [moderation interface](../src/app/(subsystems)/info/admin/moderation/page.js), [visitor home interface](../src/app/(subsystems)/info/visitor/page.js)

## Appendix N — Administrative Dashboard and Analytics

**Technology:** Next.js, Supabase

```javascript
const response = await fetch(
  `/info/api/admin/analytics?days=${days}&bucket=${bucket}`,
  { credentials: 'same-origin', cache: 'no-store' }
)
const report = result.analytics
setStats({
  totalUsers: report.summary.totalUsers,
  activeUsers: report.summary.activeUsers,
  totalEvents: report.summary.totalEvents,
  totalPlaces: report.summary.totalPlaces,
  openInquiries: report.summary.openInquiries,
})
```

```javascript
await adminSupabase.from('info_audit_log').insert({
  user_id: userId,
  action,
  table_name: 'info_tourist_spots',
  record_id: recordId,
  changes,
})
```

**Sources:** [analytics dashboard](../src/app/(subsystems)/info/admin/analytics/page.js), [analytics API](../src/app/(subsystems)/info/api/admin/analytics/route.js), [listing audit helper](../src/app/(subsystems)/info/api/admin/tourist-spots/route.js)
