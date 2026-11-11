const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.resolve(__dirname, '../..')
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8')

test('event registration identity comes only from the signed-in server session', () => {
  const route = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'user',
    'events',
    '[id]',
    'registration',
    'route.js'
  )
  const migration = read('supabase', 'migrations', '083_persistent_engagement_workflows.sql')

  assert.match(route, /getServerSession\(request\)\?\.user_id/)
  assert.match(route, /p_user_id:\s*context\.userId/)
  assert.doesNotMatch(route, /p_user_id:\s*(?:body|payload)\./)
  assert.match(migration, /status = 'published'\s+AND approval_status = 'approved'[\s\S]*?FOR UPDATE/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.register_for_event\(UUID, UUID\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.register_for_event\(UUID, UUID\) TO service_role/)
})

test('scheduled message delivery requires a strong cron secret before database access', () => {
  const route = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'cron',
    'admin-messages',
    'route.js'
  )
  const migration = read('supabase', 'migrations', '083_persistent_engagement_workflows.sql')

  assert.match(route, /Buffer\.byteLength\(expected\)\s*<\s*32/)
  assert.match(route, /timingSafeEqual/)
  assert.match(route, /if\s*\(!isAuthorized\(request\)\)\s*return/)
  assert.ok(route.indexOf('if (!isAuthorized(request))') < route.indexOf('createClient('))
  assert.match(route, /rpc\('claim_due_admin_messages'/)
  assert.match(migration, /scheduled_for <= NOW\(\)[\s\S]*?FOR UPDATE SKIP LOCKED/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_due_admin_messages\(INTEGER\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_due_admin_messages\(INTEGER\) TO service_role/)
  assert.match(route, /\.from\('info_notifications'\)\.insert\(/)
  assert.match(route, /const status = notificationError \? 'failed' : 'delivered'/)
  assert.match(route, /\.update\(\{\s*status,/)
})

test('event reminder attempts are persisted and partial delivery is reported', () => {
  const route = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'events',
    '[id]',
    'reminders',
    'route.js'
  )
  const migration = read('supabase', 'migrations', '083_persistent_engagement_workflows.sql')

  assert.match(route, /authorizeAdminApi\(request\)/)
  assert.match(route, /\.from\('event_registrations'\)[\s\S]*?\.eq\('status', 'confirmed'\)/)
  assert.match(route, /sgMail\.send\(/)
  assert.match(route, /\.from\('event_reminder_deliveries'\)\.insert\(logs\)/)
  assert.match(route, /success:\s*failed === 0/)
  assert.match(route, /failed \? 207 : 200/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.event_reminder_deliveries/)
})

test('registration avoids a full auth-user scan and local auth email uses SendGrid SMTP', () => {
  const registration = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'register',
    'route.js'
  )
  const config = read('supabase', 'config.toml')
  const smtpConfig = config.match(/\[auth\.email\.smtp\]([\s\S]*?)(?=\n\[|\s*$)/)?.[1] || ''

  assert.match(registration, /supabase\.auth\.signUp\(/)
  assert.doesNotMatch(registration, /auth\.admin\.listUsers/)
  assert.match(smtpConfig, /enabled\s*=\s*true/)
  assert.match(smtpConfig, /host\s*=\s*"smtp\.sendgrid\.net"/)
  assert.match(smtpConfig, /pass\s*=\s*"env\(SENDGRID_API_KEY\)"/)
  assert.match(smtpConfig, /admin_email\s*=\s*"env\(SENDGRID_FROM_EMAIL\)"/)
  assert.doesNotMatch(smtpConfig, /SG\.[A-Za-z0-9_-]{20,}/)
})

test('public blog feeds exclude pending and future-scheduled submissions', () => {
  const feed = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'user',
    'feed',
    'route.js'
  )
  const migration = read('supabase', 'migrations', '083_persistent_engagement_workflows.sql')

  assert.match(feed, /\.from\('info_blogs'\)[\s\S]*?\.eq\('status', 'published'\)[\s\S]*?\.eq\('approval_status', 'approved'\)/)
  assert.match(feed, /\.or\(`published_at\.is\.null,published_at\.lte\.\$\{new Date\(\)\.toISOString\(\)\}`\)/)
  assert.match(migration, /status = 'published' AND approval_status = 'approved'[\s\S]*?published_at IS NULL OR published_at <= NOW\(\)/)
})

test('maintenance enforcement is represented in the applied migration and request proxy', () => {
  const migration = read('supabase', 'migrations', '065_site_maintenance_settings.sql')
  const proxy = read('src', 'proxy.js')
  const adminRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'settings',
    'maintenance',
    'route.js'
  )

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.site_maintenance_settings/)
  assert.match(migration, /REVOKE ALL ON TABLE public\.site_maintenance_settings FROM PUBLIC, anon, authenticated/)
  assert.match(proxy, /getMaintenanceSettings\(\)/)
  assert.match(proxy, /if \(maintenance\?\.enabled\)/)
  assert.match(proxy, /if \(!isAdmin && !isAdminRoute/)
  assert.match(adminRoute, /authorizeAdminApi\(request\)/)
})

test('admin account deletion is scheduled, authorized, and never directly deletes the profile', () => {
  const route = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'users',
    'route.js'
  )
  const page = read('src', 'app', '(subsystems)', 'info', 'admin', 'users', 'page.js')
  const migration = read('supabase', 'migrations', '087_admin_scheduled_account_deletion.sql')
  const recovery = read('src', 'app', '(subsystems)', 'info', '(auth)', 'account-recovery', 'page.js')

  assert.match(route, /authorizeAdminApi\(request\)/)
  assert.match(route, /schedule_admin_account_deletion/)
  assert.match(route, /emailNotificationSent/)
  assert.match(migration, /auth\.role\(\) IS DISTINCT FROM 'service_role'/)
  assert.match(migration, /admin_user\.user_type IN \('admin', 'administrator'\)/)
  assert.match(migration, /v_target\.user_type IN \('admin', 'administrator', 'moderator'\)/)
  assert.match(migration, /interval '360 hours'/)
  assert.match(migration, /user_session_versions/)
  assert.match(migration, /info_audit_log/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schedule_admin_account_deletion\(uuid, uuid\) FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.schedule_admin_account_deletion\(uuid, uuid\) TO service_role/)
  assert.match(page, /method: 'DELETE'/)
  assert.match(page, /15-day grace period/)
  assert.doesNotMatch(page, /from\('info_users'\)\.delete\(\)/)
  assert.doesNotMatch(recovery, /30-day grace period|You have 30 days/)
})

test('popular destinations are calculated from consented detail-page views instead of fixed chart data', () => {
  const migration = read('supabase', 'migrations', '085_popular_tourist_spot_analytics.sql')
  const route = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'analytics',
    'visits',
    'route.js'
  )
  const dashboard = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'admin',
    'dashboard',
    'page.js'
  )
  const tracker = read('src', 'components', 'SiteVisitTracker.js')

  assert.match(migration, /get_popular_tourist_spots\(p_days INTEGER DEFAULT 30\)/)
  assert.match(migration, /site_page_views/)
  assert.match(migration, /tourist-spots\/\[\^\/\]\+\$/)
  assert.match(migration, /JOIN public\.info_tourist_spots/)
  assert.match(migration, /COUNT\(DISTINCT views\.visitor_hash\)/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_popular_tourist_spots\(INTEGER\) TO service_role/)
  assert.match(route, /rpc\('get_popular_tourist_spots', \{ p_days: 30 \}\)/)
  assert.match(route, /popularDestinations:\s*destinationResult\.error \? null : destinationResult\.data/)
  assert.match(tracker, /if \(!pagePath \|\| !getConsent\(\)\)/)
  assert.match(dashboard, /const popularAttractions = visitorMetrics\.popularDestinations/)
  assert.doesNotMatch(dashboard, /Bagasbas Beach', value: 92/)
  assert.match(dashboard, /No consented destination views recorded in the last 30 days/)
})

test('weather status does not require an unused OpenWeather API key', () => {
  const weather = read('src', 'lib', 'daetWeather.js')
  const health = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'system-health',
    'route.js'
  )

  assert.match(weather, /api\.open-meteo\.com/)
  assert.doesNotMatch(health, /OPENWEATHER_API_KEY/)
  assert.match(health, /weatherConfiguration:\s*\{\s*status:\s*'Not required'/)
})