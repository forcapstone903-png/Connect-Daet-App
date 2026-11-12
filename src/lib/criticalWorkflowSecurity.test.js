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

test('moderation appeals are bound to the signed-in user and forum replies use server enforcement', () => {
  const appealRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'user',
    'moderation-appeals',
    'route.js'
  )
  const appealMigration = read('supabase', 'migrations', '099_moderation_profanity_appeals.sql')
  const forumPage = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'visitor',
    'forum',
    '[id]',
    'page.js'
  )
  const replyRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'forum-replies',
    'route.js'
  )

  assert.match(appealRoute, /getServerSession\(request\)\?\.user_id/)
  assert.match(appealRoute, /getActivePublishingRestriction\(client, userId\)/)
  assert.match(appealRoute, /user_moderation_appeals/)
  assert.doesNotMatch(appealRoute, /body\.userId|body\.user_id/)
  assert.match(appealMigration, /user_moderation_appeals_one_pending_idx/)
  assert.match(appealMigration, /review_user_moderation_appeal/)
  assert.match(appealMigration, /GRANT EXECUTE ON FUNCTION public\.review_user_moderation_appeal/)
  assert.match(appealMigration, /CREATE TRIGGER tr_flag_profanity_content AFTER INSERT OR UPDATE/)
  assert.match(forumPage, /fetch\('\/info\/api\/forum-replies'/)
  assert.doesNotMatch(forumPage, /\.from\('forum_replies'\)\.insert\(/)
  assert.match(replyRoute, /getActiveCommentRestriction\(adminSupabase, userId\)/)
  assert.match(replyRoute, /LOCKED_THREAD_STATUSES = new Set\(\['locked', 'closed', 'archived'\]\)/)
  assert.match(replyRoute, /status: isModerator \? 'active' : 'pending'/)
})

test('comment mutes are enforced by the API and database for blogs and forums', () => {
  const migration = read('supabase', 'migrations', '107_moderator_comment_controls.sql')
  const commentApi = read('src', 'app', '(subsystems)', 'info', 'api', 'comments', 'route.js')
  const blogCommentApi = read('src', 'app', '(subsystems)', 'info', 'api', 'blog-comments', 'route.js')
  const forumReplyApi = read('src', 'app', '(subsystems)', 'info', 'api', 'forum-replies', 'route.js')
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const moderatorCommentsApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'comments', 'route.js')

  assert.match(commentApi, /getActiveCommentRestriction\(adminSupabase, session\.user_id\)/)
  assert.match(blogCommentApi, /getActiveCommentRestriction\(adminSupabase, userId\)/)
  assert.match(forumReplyApi, /getActiveCommentRestriction\(adminSupabase, userId\)/)
  assert.match(moderatorCommentsApi, /authorizeAdminApi\(request\)/)
  assert.match(moderatorCommentsApi, /moderator_deleted_comment/)
  assert.match(moderatorCommentsApi, /mute_commenting/)
  assert.match(moderationApi, /'admin_comment_mutes'/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.admin_comment_mutes/)
  assert.match(migration, /BEFORE INSERT ON public\.content_comments/)
  assert.match(migration, /BEFORE INSERT ON public\.info_comments/)
  assert.match(migration, /BEFORE INSERT ON public\.forum_replies/)
  assert.match(migration, /muted from commenting/)
})

test('moderator dashboard summarizes actionable queues and links to their tabs', () => {
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const dashboard = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderator-dashboard', 'page.js')
  const moderationPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderation', 'page.js')

  assert.match(moderationApi, /pendingForumTopics/)
  assert.match(moderationApi, /pendingForumReplies/)
  assert.match(moderationApi, /pendingBlogComments/)
  assert.match(moderationApi, /openInquiries/)
  assert.match(dashboard, /Moderation workload/)
  assert.match(dashboard, /Needs attention/)
  assert.match(dashboard, /pendingReports/)
  assert.match(dashboard, /pendingAppeals/)
  assert.match(moderationPage, /new URLSearchParams\(window\.location\.search\)\.get\('tab'\)/)
})

test('users can report accounts, posts, forum discussions, reviews, comments, and reposts', () => {
  const reportApi = read('src', 'app', '(subsystems)', 'info', 'api', 'reports', 'route.js')
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const socialActions = read('src', 'app', '(subsystems)', 'info', 'components', 'user', 'SocialActionBar.js')
  const profilePage = read('src', 'app', '(subsystems)', 'info', 'user', 'profile', '[id]', 'page.js')
  const forumPage = read('src', 'app', '(subsystems)', 'info', 'user', 'forums', '[id]', 'page.js')
  const visitorPage = read('src', 'app', '(subsystems)', 'info', 'visitor', 'page.js')
  const userDashboard = read('src', 'app', '(subsystems)', 'info', 'user', 'dashboard', 'page.js')

  assert.match(reportApi, /attraction_ratings: 'user_id'/)
  assert.match(reportApi, /info_users: 'id'/)
  assert.match(moderationApi, /attraction_ratings: \{ select:/)
  assert.match(moderationApi, /info_users: \{ select:/)
  assert.match(socialActions, /forum_thread: 'forum_threads'/)
  assert.match(socialActions, /reportTableByType/)
  assert.match(profilePage, /itemTable: "info_users"/)
  assert.match(forumPage, /reportTable: 'forum_threads'/)
  assert.match(visitorPage, /itemTable: 'attraction_ratings'/)
  assert.match(userDashboard, /item\.is_repost \? 'reposts'/)
  assert.match(userDashboard, /reportItemId=\{canReportItem \? reportItemId : undefined\}/)
})

test('approving account reports applies severity-based suspensions atomically', () => {
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const moderationPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderation', 'page.js')
  const migration = read('supabase', 'migrations', '108_reported_account_moderation.sql')

  assert.match(moderationApi, /action === 'approve-account-report'/)
  assert.match(moderationApi, /rpc\('approve_account_report_and_suspend'/)
  assert.match(moderationApi, /Approve the account report to apply the suspension/)
  assert.match(moderationPage, /Approve &amp; suspend/)
  assert.match(moderationPage, /value="critical">Critical — permanent suspension/)
  assert.match(migration, /WHEN 'low' THEN 7/)
  assert.match(migration, /WHEN 'medium' THEN 30/)
  assert.match(migration, /WHEN 'high' THEN 90/)
  assert.match(migration, /ELSE NULL/)
  assert.match(migration, /status = 'resolved'/)
  assert.match(migration, /ban_type = 'suspension'/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.approve_account_report_and_suspend/)
})

test('moderator blog unpublishing accepts an optional note and notifies the author', () => {
  const moderationApi = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const moderationPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderation', 'page.js')
  const blogPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'blog', 'page.js')
  const notificationHelper = read('src', 'lib', 'contentDeletionNotifications.mjs')

  assert.match(moderationApi, /action === 'unpublish-blogs'/)
  assert.match(moderationApi, /notifyBlogAuthorsOfUnpublish/)
  assert.match(moderationPage, /Optional comment about why this blog is being unpublished/)
  assert.match(blogPage, /action: 'unpublish-blogs'/)
  assert.match(notificationHelper, /Reason: \$\{cleanedReason\}/)
})

test('staff deletion workflows notify authors for user content across dashboards', () => {
  const notificationHelper = read('src', 'lib', 'contentDeletionNotifications.mjs')
  const blogRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'blogs', '[id]', 'route.js')
  const forumRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'forum', '[id]', 'route.js')
  const eventRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'events', 'route.js')
  const moderationRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const commentRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'comments', 'route.js')
  const userContentRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'user-content', 'route.js')
  const eventPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'events', 'page.js')
  const tourismPage = read('src', 'app', '(subsystems)', 'info', 'admin', 'tourism-dashboard', 'page.js')

  assert.match(notificationHelper, /info_notifications'\)\.insert/)
  for (const route of [blogRoute, forumRoute, eventRoute, moderationRoute, commentRoute, userContentRoute]) {
    assert.match(route, /notifyContentAuthor[s]?OfDeletion/)
  }
  assert.match(eventPage, /fetch\('\/info\/api\/admin\/events'[\s\S]*?method:\s*'DELETE'/)
  assert.match(tourismPage, /fetch\('\/info\/api\/admin\/events'[\s\S]*?method:\s*'DELETE'/)
})

test('community submissions use pre-moderation and moderator review stays server-authorized', () => {
  const migration = read('supabase', 'migrations', '101_moderator_workflows.sql')
  const moderationRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')

  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hold_user_content_for_moderation/)
  assert.match(migration, /NEW\.status := 'pending'/)
  assert.match(migration, /'archived', 'approved', 'rejected'/)
  assert.match(migration, /TG_TABLE_NAME IN \('info_user_posts', 'forum_threads'\)[\s\S]*?NEW\.status = 'draft'[\s\S]*?RETURN NEW/)
  assert.match(migration, /BEFORE INSERT OR UPDATE ON public\.%I/)
  assert.match(read('src', 'app', '(subsystems)', 'info', 'api', 'posts', 'route.js'), /status: isModerator \? 'published' : 'pending'/)
  assert.match(read('src', 'app', '(subsystems)', 'info', 'api', 'comments', 'route.js'), /status: isModerator \? 'active' : 'pending'/)
  assert.match(read('src', 'app', '(subsystems)', 'info', 'api', 'blog-comments', 'route.js'), /status: isModerator \? 'approved' : 'pending'/)
  assert.match(migration, /content_comments_select_active_or_owner_or_staff/)
  assert.match(moderationRoute, /action === 'review-submission'/)
  assert.match(moderationRoute, /authorizeAdminApi\(request\)/)
  assert.match(moderationRoute, /action === 'edit-reported-content'/)
})

test('community guidelines are public-read and moderator-write only', () => {
  const publicRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'community-guidelines', 'route.js')
  const adminRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'community-guidelines', 'route.js')
  const roles = read('src', 'lib', 'staffRoles.mjs')

  assert.match(publicRoute, /select\('value, updated_at'\)/)
  assert.doesNotMatch(publicRoute, /authorizeAdminApi/)
  assert.match(adminRoute, /authorizeAdminApi\(request\)/)
  assert.match(roles, /\['\/info\/admin\/community-guidelines', 'moderation\.manage'\]/)
  assert.match(roles, /\['\/info\/api\/admin\/community-guidelines', 'moderation\.manage'\]/)
})

test('new community submissions notify moderators and appear in their staff inbox', () => {
  const notificationHelper = read('src', 'lib', 'adminNotifications.js')
  const sidebar = read('src', 'app', '(subsystems)', 'info', 'components', 'AdminSidebar.js')
  const inbox = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderation', 'notifications', 'page.js')
  const dashboard = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderator-dashboard', 'page.js')
  const forumRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'posts', 'route.js')
  const replyRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'forum-replies', 'route.js')
  const commentRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'comments', 'route.js')
  const blogRoute = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'blogs', 'route.js')

  assert.match(notificationHelper, /export function notifyModerators/)
  assert.match(notificationHelper, /'moderator'/)
  assert.match(sidebar, /Post Notifications/)
  assert.match(sidebar, /unreadNotifications/)
  assert.match(inbox, /\/info\/api\/notifications/)
  assert.match(dashboard, /href="\/info\/admin\/moderation\/notifications"/)
  assert.match(dashboard, /AdminButton icon="refresh"/)
  assert.match(forumRoute, /notifyModerators\(adminSupabase/)
  assert.match(replyRoute, /notifyModerators\(adminSupabase/)
  assert.match(commentRoute, /notifyModerators\(adminSupabase/)
  assert.match(blogRoute, /notifyModerators\(adminSupabase/)
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
  const uniqueViewsMigration = read('supabase', 'migrations', '092_unique_tourist_spot_views.sql')
  const accountViewsMigration = read('supabase', 'migrations', '093_tourist_spot_account_views.sql')
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
  const adminAnalyticsRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'analytics',
    'route.js'
  )
  const adminAnalyticsMigration = read('supabase', 'migrations', '100_admin_analytics_exports.sql')
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
  assert.match(uniqueViewsMigration, /COUNT\(DISTINCT views\.visitor_hash\)::INTEGER AS page_views/)
  assert.match(accountViewsMigration, /FROM public\.tourist_spot_account_views AS views/)
  assert.match(accountViewsMigration, /GRANT EXECUTE ON FUNCTION public\.get_popular_tourist_spots\(INTEGER\) TO anon, authenticated, service_role/)
  assert.match(route, /rpc\('get_popular_tourist_spots', \{ p_days: 30 \}\)/)
  assert.match(route, /popularDestinations:\s*destinationResult\.error \? null : destinationResult\.data/)
  assert.match(tracker, /if \(!pagePath \|\| !getConsent\(\)\)/)
  assert.match(route, /createHmac\('sha256', serviceRoleKey\)/)
  assert.match(route, /tourist-spot-account:\$\{session\.user_id\}/)
  assert.match(adminAnalyticsRoute, /rpc\('get_admin_analytics_report'/)
  assert.match(adminAnalyticsMigration, /popular_destinations AS \([\s\S]*FROM public\.site_page_views/)
  assert.match(dashboard, /readJson\('\/info\/api\/admin\/analytics\?days=30'\)/)
  assert.match(dashboard, /analytics\.popularDestinations/)
  assert.match(dashboard, /No consented destination views recorded in the last 30 days/)
})

test('tourist spot view counts are deduplicated by signed-in account', () => {
  const migration = read('supabase', 'migrations', '093_tourist_spot_account_views.sql')
  const trackerRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'analytics',
    'visits',
    'route.js'
  )
  const adminRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'tourist-spots',
    'route.js'
  )
  const adminDetailRoute = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'api',
    'admin',
    'tourist-spots',
    '[id]',
    'route.js'
  )
  const adminPage = read(
    'src',
    'app',
    '(subsystems)',
    'info',
    'admin',
    'tourist-spots',
    'page.js'
  )
  const trending = read('src', 'app', '(subsystems)', 'info', 'components', 'home', 'TrendingNow.js')

  assert.match(migration, /PRIMARY KEY \(tourist_spot_id, account_hash\)/)
  assert.match(migration, /ON CONFLICT \(tourist_spot_id, account_hash\) DO NOTHING/)
  assert.match(migration, /COUNT\(views\.account_hash\) FILTER[\s\S]*SELECT since_at FROM bounds/)
  assert.match(migration, /last_viewed_at < NOW\(\) - INTERVAL '90 days'/)
  assert.match(trackerRoute, /record_tourist_spot_account_view/)
  assert.match(trackerRoute, /createHmac\('sha256', serviceRoleKey\)/)
  assert.match(adminRoute, /rpc\('get_tourist_spot_account_view_counts', \{ p_days: 90 \}\)/)
  assert.match(adminDetailRoute, /getAccountViewCount\(spotId\)/)
  assert.doesNotMatch(adminDetailRoute, /visit_count:\s*view_count/)
  assert.match(adminPage, /Popular tourist spots/)
  assert.doesNotMatch(adminPage, /label="View Count"/)
  assert.match(trending, /rpc\('get_popular_tourist_spots', \{ p_days: 30 \}\)/)
  assert.doesNotMatch(trending, /\.order\('view_count'/)
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

test('blocked users cannot message each other and restricted conversations stay hidden', () => {
  const messages = read('src', 'app', '(subsystems)', 'info', 'api', 'messages', 'route.js')
  const privacy = read('src', 'lib', 'serverPrivacy.js')

  assert.match(messages, /\.from\('user_blocks'\)[\s\S]*?blocked_id\.eq\.\$\{recipientId\}[\s\S]*?if \(blockRows\?\.length\)/)
  assert.match(privacy, /privacyLevel === 'public'\) return \{ allowed: true, error: null \}/)
  assert.match(messages, /return privacyLevel !== 'public'/)
  assert.match(messages, /!restrictedIds\.has\(otherUserId\) && !blockedIds\.has\(otherUserId\)/)
})

test('pinned message responses omit content deleted for the current viewer', () => {
  const pinnedMessages = read('src', 'app', '(subsystems)', 'info', 'api', 'messages', '[id]', 'pinned', 'route.js')

  assert.match(pinnedMessages, /const unavailable = !message \|\| message\.deleted_for\?\.includes\(context\.userId\)/)
  assert.match(pinnedMessages, /message: unavailable \? null : message/)
  assert.match(pinnedMessages, /sender: unavailable \? null :/)
})

test('blocked relationships prevent new follows and follow-request approval', () => {
  const follow = read('src', 'app', '(subsystems)', 'info', 'api', 'users', '[id]', 'follow', 'route.js')
  const followRequests = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'follow-requests', 'route.js')

  assert.match(follow, /viewerBlockResult\.data\?\.length \|\| targetBlockResult\.data\?\.length/)
  assert.match(follow, /status: 403/)
  assert.match(followRequests, /viewerBlockResult\.data\?\.length \|\| requesterBlockResult\.data\?\.length/)
  assert.match(followRequests, /errorResponse\([\s\S]*?, 403\)/)
})

test('dashboard retrieves saved items through every private API page', () => {
  const favorites = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'favorites', 'route.js')
  const dashboard = read('src', 'app', '(subsystems)', 'info', 'user', 'dashboard', 'page.js')

  assert.match(favorites, /\.select\(columns, \{ count: 'exact' \}\)/)
  assert.match(favorites, /listFavorites\('item_type, item_id, planned_visit_date, trip_notes'\)/)
  assert.match(favorites, /listFavorites\('item_type, item_id'\)/)
  assert.match(favorites, /const start = \(page - 1\) \* pageSize/)
  assert.match(favorites, /\.range\(start, end\)/)
  assert.match(dashboard, /while \(page <= pageCount\)/)
  assert.match(dashboard, /pageCount = result\.pagination\.pages/)
})

test('private profiles do not return relationship lists or identifying details to unauthorized viewers', () => {
  const profile = read('src', 'app', '(subsystems)', 'info', 'api', 'users', '[id]', 'route.js')

  assert.match(profile, /const canViewProfileContent = isOwnProfile \|\| privacyLevel === 'public' \|\| Boolean\(followRow\)/)
  assert.match(profile, /const followers = canViewProfileContent\s*\?/)
  assert.match(profile, /followers_count: canViewProfileContent \?/)
  assert.match(profile, /profile: canViewProfileContent \? \{[\s\S]*?\} : \{[\s\S]*?full_name:[\s\S]*?profile_image_url:/)
})

test('notification preference filters mentions as well as comments and replies', () => {
  const notifications = read('src', 'app', '(subsystems)', 'info', 'api', 'notifications', 'route.js')

  assert.match(notifications, /preferences\.forumMentions === false\) suppressedTypes\.push\('comment', 'mention'\)/)
})

test('rejected events can only be resubmitted by their owner and return to pending review', () => {
  const route = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'events', '[id]', 'route.js')
  const page = read('src', 'app', '(subsystems)', 'info', 'user', 'event-submissions', 'page.js')

  assert.match(route, /getServerSession\(request\)\?\.user_id/)
  assert.match(route, /\.eq\('created_by', userId\)\s*\.eq\('approval_status', 'rejected'\)/)
  assert.match(route, /approval_status: 'pending'/)
  assert.match(route, /reviewed_at: null,[\s\S]*?reviewed_by: null,[\s\S]*?rejection_reason: null/)
  assert.match(page, /Edit and resubmit/)
  assert.match(page, /method: 'PATCH'/)
})

test('auth sidebar translucent cards are not forced to opaque white', () => {
  const authStyles = read('src', 'app', '(subsystems)', 'info', '(auth)', 'auth.css')

  assert.doesNotMatch(authStyles, /\[class\*='bg-white\/'\]/)
})

test('settings no longer advertises privacy controls that are not implemented', () => {
  const settings = read('src', 'lib', 'userSettings.js')
  const route = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'settings', 'route.js')
  const translations = read('src', 'lib', 'i18n.js')

  for (const source of [settings, route, translations]) {
    assert.doesNotMatch(source, /showOnlineStatus|showActivity|allowMentions/)
  }
})

test('forum replies enforce posting restrictions and keep other users out of draft threads', () => {
  const route = read('src', 'app', '(subsystems)', 'info', 'api', 'forum-replies', 'route.js')

  assert.match(route, /getActiveCommentRestriction/)
  assert.equal((route.match(/getRestrictionResponse\(adminSupabase, session\.user_id\)/g) || []).length, 2)
  assert.match(route, /\.select\('id, status, created_by'\)/)
  assert.match(route, /PUBLIC_THREAD_STATUSES\.has\(String\(thread\.status \|\| ''\)\.toLowerCase\(\)\)[\s\S]*?!canManageReply\(session, thread\.created_by\)/)
})

test('public blog surfaces and reposts exclude unapproved and future-scheduled submissions', () => {
  const reposts = read('src', 'app', '(subsystems)', 'info', 'api', 'reposts', 'route.js')
  const search = read('src', 'app', '(subsystems)', 'info', 'visitor', 'search', 'page.js')
  const visitorBlog = read('src', 'app', '(subsystems)', 'info', 'visitor', 'blog', '[id]', 'page.js')
  const profile = read('src', 'app', '(subsystems)', 'info', 'user', 'profile', 'page.js')
  const saved = read('src', 'app', '(subsystems)', 'info', 'user', 'saved', 'page.js')

  assert.match(reposts, /blog: \{[^}]*approval_status/)
  assert.match(reposts, /contentType === 'blog'[\s\S]*?\.eq\('approval_status', 'approved'\)[\s\S]*?published_at\.is\.null,published_at\.lte\./)
  assert.match(search, /\.from\('info_blogs'\)[\s\S]*?\.eq\('approval_status', 'approved'\)[\s\S]*?published_at\.is\.null,published_at\.lte\./)
  assert.match(visitorBlog, /\.eq\('approval_status', 'approved'\)[\s\S]*?published_at\.is\.null,published_at\.lte\./)
  assert.match(profile, /\.from\('info_blogs'\)[\s\S]*?\.eq\('approval_status', 'approved'\)[\s\S]*?published_at\.is\.null,published_at\.lte\./)
  assert.match(saved, /\.from\('info_blogs'\)[\s\S]*?\.eq\('approval_status', 'approved'\)[\s\S]*?published_at\.is\.null,published_at\.lte\./)
})