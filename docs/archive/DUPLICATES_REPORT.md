# Connect Daet Project Duplication Audit

**Audit scope:** project worktree at the repository root. Paths below are complete paths relative to that root. `node_modules`, `.next`, `.git`, `supabase/.temp`, and build-output directories (`build`, `dist`, `out`, `coverage`) were excluded. The initial audit was read-only; the Phase 1 cleanup actions and updated classifications are recorded in the addendum below.

## 1. Summary

“Finding” counts group related file sets; they are not raw clone-pair counts. In particular, jscpd reported 163 clone blocks, grouped below into four findings.

| Category | Findings | Estimated cleanup effort |
|---|---:|---|
| 1. Exact duplicates | 5 | Low–Medium; allow extra time to review empty stubs |
| 2. Near duplicates | 4 | Medium–High |
| 3. Same purpose, different names | 3 | Medium |
| 4. Duplicate logic | 2 | High, because shared authorization and service-role behavior must be preserved |
| 5. Potentially unused files | 1 | High; 160 static-analysis candidates require reference checks |
| 6. Duplicate docs and migrations | 3 | Medium–High; migration history must be preserved |

### Overall scan results

- SHA-256 comparison produced **5 identical-content groups**: one logo pair, two pairs of identical route pages, one group of 33 zero-byte files, and one identical migration pair.
- jscpd scanned **489 files under `src`** and found **163 clone blocks**: 2,344 duplicated lines total (1.95% of scanned lines); JavaScript was 2.29% duplicated and CSS 0.38%. jscpd reports code blocks, not proof that every entire-file pair is at least 80% alike.
- Knip reported **160 potentially unused files**. This list is a review queue, not a deletion list: for example, it marks admin components as unused even though `admin/blogs/page.js` imports `AdminShell` and `AdminDiscussionModeration` through direct or barrel imports.
- depcheck also reported possible unused and missing dependencies. Those are package findings, not file-duplication findings, and need their own dependency review.
- No duplicate three-digit migration prefixes were found. Migration `080` and `081` have different prefixes but identical contents.

## 2. Detailed findings

### Category 1 — Exact duplicates

#### 1.1 Identical logo images

- **Files involved:** `public/logo.png`; `src/app/(subsystems)/info/assets/images/logo.png`
- **Why:** Both files have the same SHA-256 hash (`BDF2C4DC92F5…`) and size (226,536 bytes). The public copy is referenced as `/logo.png`; About and visitor navigation/footer components import the `src` copy.
- **Risk:** Low.
- **Recommendation:** Keep one canonical asset if the import sites can be standardized; until then, both paths are in use and should remain.
- **Safe-to-delete check:** Search all static `/logo.png` references and imports of `assets/images/logo.png`; update and verify both usage styles before removing either file.

#### 1.2 Identical engagement redirect pages

- **Files involved:** `src/app/(subsystems)/info/admin/analytics/engagement/page.js`; `src/app/(subsystems)/info/admin/engagement/page.js`
- **Why:** The files have identical hashes (`D3BBE9DE222B…`) and both redirect to `/info/admin/analytics#engagement`.
- **Risk:** Medium.
- **Recommendation:** Keep `/info/admin/analytics#engagement` as the destination and retain one redirect route as the canonical alias; remove the other only after confirming old links and access rules.
- **Safe-to-delete check:** Search navigation, role rules, breadcrumbs, notifications, and external links for both route paths.

#### 1.3 Identical moderation-receipt 404 pages

- **Files involved:** `src/app/(subsystems)/info/admin/moderation/receipts/page.js`; `src/app/(subsystems)/info/user/moderation-receipts/page.js`
- **Why:** Both files have the same hash (`87EC4296915F…`) and both call `notFound()`. The route names imply different admin and user contexts, but neither page currently renders receipt content.
- **Risk:** High, because these routes concern moderation records and role-specific access.
- **Recommendation:** Do not merge or delete based on identical source alone. Confirm whether the 404 stubs are intentional or unfinished role-specific screens.
- **Safe-to-delete check:** Verify route links, staff/user navigation, authorization policy, and whether either route is expected by tests or external users.

#### 1.4 Thirty-three zero-byte files

- **Files involved (all hash to SHA-256 `E3B0C44298FC…`):**

  ```text
  src/app/(subsystems)/info/api/moderation/receipts/route.js
  src/app/(subsystems)/info/api/moderation/receipts/[id]/pdf/route.js
  src/app/(subsystems)/info/api/user/content-preferences/route.js
  src/app/(subsystems)/info/components/NotificationBell.js
  src/app/(subsystems)/info/components/admin/AdminNotificationBell.js
  src/app/(subsystems)/info/components/user/BlogsIndex.js
  src/app/(subsystems)/info/report-preview/blog/[id]/page.js
  src/lib/accountAccess.mjs
  src/lib/accountAccess.test.mjs
  src/lib/accountStatusServer.js
  src/lib/adminAuthorizationPolicy.js
  src/lib/cronAuthorization.js
  src/lib/navigationBreadcrumbs.test.mjs
  src/lib/navigationConfig.mjs
  src/lib/notificationBellUtils.mjs
  src/lib/notificationBellUtils.test.mjs
  src/lib/peopleRecommendationCache.mjs
  src/lib/peopleSuggestionScoring.mjs
  src/lib/peopleSuggestionScoring.test.mjs
  src/lib/recommendationService.mjs
  src/lib/recommendationService.test.mjs
  src/lib/restrictionLiftWorkflow.test.mjs
  src/lib/suspensionWorkflow.test.mjs
  supabase/migrations/122_notification_bell_indexes.sql
  supabase/migrations/123_unified_moderation_workflow.sql
  supabase/migrations/124_suspension_cases.sql
  supabase/migrations/125_people_suggestion_cache.sql
  supabase/migrations/126_content_recommendation_dismissals.sql
  supabase/migrations/132_lift_account_restrictions.sql
  supabase/migrations/137_moderation_governance_receipt_fixes.sql
  supabase/migrations/138_prevent_duplicate_unresolved_reports.sql
  supabase/migrations/139_dedicated_report_management.sql
  supabase/migrations/144_restricted_account_community_writes.sql
  ```

- **Why:** Each path is currently zero bytes, so all have identical empty-file content. Ten are numbered SQL migrations; others include API routes, a dynamic page, utilities, and tests.
- **Risk:** High. Deleting a route changes the route tree, removing an empty migration can affect migration history, and empty auth/data utilities may be intentional placeholders or broken dependencies.
- **Recommendation:** Treat these as separate implementation/cleanup decisions, not as interchangeable copies. Fill, retain, or remove each only after its intended role is established.
- **Safe-to-delete check:** For source files, inspect imports, route URLs, tests, and dynamic references. For each migration, inspect the remote/local migration ledger and deployment history first. No member of this group is confirmed safe to delete now.

#### 1.5 Identical blog-approval migrations

- **Files involved:** `supabase/migrations/080_blog_admin_approval.sql`; `supabase/migrations/081_blog_admin_approval.sql`
- **Why:** Both are 8,182 bytes and have the same SHA-256 hash (`910E4934D36A…`). The SQL repeats blog approval columns/backfill, RLS policies, a trigger, and moderation functions.
- **Risk:** High; this is database and access-control logic.
- **Recommendation:** Do not remove an already-applied migration. If neither has shipped, decide which migration ID is canonical before deployment; otherwise keep both immutable in history and document the duplicate.
- **Safe-to-delete check:** Confirm migration status in every Supabase environment, inspect the migration ledger and deployment records, and verify whether both scripts have been applied.

### Category 2 — Near duplicates

#### 2.1 Authentication form and recovery flow blocks

- **Files involved:** `src/app/(subsystems)/info/(auth)/login/page.js`; `src/app/(subsystems)/info/(auth)/register/page.js`; `src/app/(subsystems)/info/(auth)/account-recovery/page.js`; `src/app/(subsystems)/info/(auth)/forgot-password/page.js`; `src/app/(subsystems)/info/(auth)/reset-password/page.js`; `src/app/(subsystems)/info/api/account/recovery/route.js`; `src/app/(subsystems)/info/api/forgot-password/route.js`; `src/app/(subsystems)/info/api/reset-password/route.js`
- **Why:** jscpd found repeated blocks in login/register (for example lines 199–215 and 228–240 in both pages), account-recovery/forgot-password (19 lines), and recovery/reset API handlers (21-line and 11-line blocks). These share form, validation, and response-handling patterns while serving distinct auth steps.
- **Risk:** High; auth behavior and account recovery are sensitive.
- **Recommendation:** Consider shared presentational or input-validation helpers, but keep the different endpoint semantics, token checks, and server-side authorization explicit.
- **Safe-to-delete check:** Verify every screen/endpoint URL, callback and redirect, password-policy rule, rate-limit behavior, and auth tests before consolidating.

#### 2.2 Admin notification pages and API boilerplate

- **Files involved:** `src/app/(subsystems)/info/admin/moderation/notifications/page.js`; `src/app/(subsystems)/info/admin/notifications/inbox/page.js`; representative API routes `src/app/(subsystems)/info/api/admin/account-oversight/route.js`, `src/app/(subsystems)/info/api/admin/community-guidelines/route.js`, `src/app/(subsystems)/info/api/admin/events/route.js`, `src/app/(subsystems)/info/api/admin/forum/route.js`
- **Why:** jscpd found 18- and 27-line clones between the notification pages and repeated 11–19-line setup/response blocks across admin API handlers. The routes may differ in permissions and data even where their scaffolding matches.
- **Risk:** High; admin notification and API handlers involve protected data.
- **Recommendation:** Extract only proven-common UI or response helpers. Keep route-specific access checks, methods, and queries local or explicitly parameterized.
- **Safe-to-delete check:** Compare route methods, `authorizeAdminApi`/role policy, request/response shapes, and all page links; no route should be removed based on boilerplate similarity.

#### 2.3 Visitor/user forum and blog detail pages

- **Files involved:** `src/app/(subsystems)/info/user/forums/[id]/page.js`; `src/app/(subsystems)/info/visitor/forum/[id]/page.js`; `src/app/(subsystems)/info/user/blogs/[id]/page.js`; `src/app/(subsystems)/info/visitor/blog/[id]/page.js`
- **Why:** jscpd found matching 38- and 30-line blocks in user/visitor forum details and repeated detail-page blocks in user/visitor blog views. The pages overlap in display logic, but authenticated-user actions can make the full page behavior different.
- **Risk:** Medium.
- **Recommendation:** Review whether shared read-only detail components are appropriate; keep guest visibility and user-only actions as explicit differences.
- **Safe-to-delete check:** Compare data visibility, comments/reactions, login prompts, edit controls, and route-specific navigation before replacing a page with a redirect or shared wrapper.

#### 2.4 Repeated in-file blocks and small components

- **Files involved:** `src/app/(subsystems)/info/admin/settings/categories/page.js`; `src/app/(subsystems)/info/visitor/search/page.js`; `src/components/PushNotificationPrompt.js`; `src/lib/contentDeletionNotifications.mjs`; `src/app/globals.css`; `src/app/(subsystems)/info/user/user-sections.css`
- **Why:** jscpd reported repeated blocks within the settings and search pages, repeated notification/prompt logic, and CSS blocks. The full scan counted 163 clones, including 6 CSS clones; these examples are candidates, not a claim that the full files are duplicates.
- **Risk:** Low–Medium.
- **Recommendation:** Consolidate only repeated branches with identical behavior; remove redundant CSS declarations only after checking cascade order and responsive selectors.
- **Safe-to-delete check:** Compare callers, conditional inputs, CSS selectors, and resulting UI states; run focused tests and visual checks after any later cleanup.

### Category 3 — Same purpose, different names

#### 3.1 Multiple admin blog URLs; overlapping but not identical workspaces

- **Files involved:** `src/app/(subsystems)/info/admin/blog/page.js`; `src/app/(subsystems)/info/admin/blogs/page.js`; `src/app/(subsystems)/info/admin/content/page.js`; `src/app/(subsystems)/info/admin/content/blogs/page.js`
- **Why:** The content hub routes its `blogs` tab to `/info/admin/blog`; `/admin/content/blogs` redirects through that hub. Separately, `/admin/blogs` is a substantial submissions/moderation screen with tabs such as pending, approved, rejected, and reported. The names overlap, but the inspected code indicates different workflows plus a redirect alias.
- **Risk:** High; these are admin content-management routes.
- **Recommendation:** Keep `/admin/blog` for its current editing workflow and `/admin/blogs` for submission/moderation unless a feature-by-feature review proves otherwise. Simplify the `content/blogs` alias chain only after selecting the canonical URL.
- **Safe-to-delete check:** Check AdminSidebar links, staff role/page rules, breadcrumbs, notification links, activity links, bookmarks, and whether the two screens expose different operations. Treat this finding as **Needs manual review**.

#### 3.2 Attraction workspace alias

- **Files involved:** `src/app/(subsystems)/info/admin/content/attractions/page.js`; `src/app/(subsystems)/info/admin/content/page.js`; `src/app/(subsystems)/info/admin/tourist-spots/page.js`
- **Why:** The `content/attractions` page redirects to the content hub with `tab=attractions`, and that hub redirects to `/admin/tourist-spots`. The latter contains the substantive management UI, so these URLs form an alias chain rather than separate attraction tools.
- **Risk:** Medium.
- **Recommendation:** Keep `/admin/tourist-spots` as the substantive page; retain or simplify the aliases rather than removing them without link checks.
- **Safe-to-delete check:** Search menus, role rules, deep links, and external bookmarks for the two alias URLs; verify the final destination remains accessible to each intended staff role.

#### 3.3 Data-management alias

- **Files involved:** `src/app/(subsystems)/info/admin/data-management/page.js`; `src/app/(subsystems)/info/admin/data/page.js`
- **Why:** `data-management/page.js` immediately redirects to `/info/admin/data`, whose page contains data metrics and backup controls. The `file-management` page is adjacent but handles media assets and is not the same job.
- **Risk:** Medium.
- **Recommendation:** Keep `/admin/data` as canonical and keep the old route as a redirect until references are migrated.
- **Safe-to-delete check:** Search navigation, role rules, tests, and saved links. Do not treat `src/app/(subsystems)/info/admin/file-management/page.js` as a duplicate without a separate media-feature review.

**Dashboard note:** `admin/dashboard`, `admin/tourism-dashboard`, and `admin/moderator-dashboard` are role-oriented dashboards, not confirmed duplicates. Preserve their role-specific behavior unless a separate comparison proves otherwise.

### Category 4 — Duplicate logic

#### 4.1 Repeated Supabase service-client construction

- **Files involved (representative):** `src/app/(subsystems)/info/api/users/[id]/route.js`; `src/app/(subsystems)/info/api/users/[id]/follow/route.js`; `src/app/(subsystems)/info/api/users/[id]/block/route.js`; `src/app/(subsystems)/info/api/users/followers/route.js`; `src/app/(subsystems)/info/api/user/feed/route.js`; `src/app/(subsystems)/info/api/admin/users/route.js`; `src/app/(subsystems)/info/api/admin/tourist-spots/route.js`; `src/app/(subsystems)/info/api/admin/staff-chat/route.js`; `src/lib/alertsServer.js`; `src/lib/appSettingsServer.js`; `src/lib/sessionVersions.js`
- **Why:** A source search found `createClient(...)` in 103 files (121 matches), with repeated service-role environment checks and options such as `autoRefreshToken: false` and `persistSession: false`. Existing helper modules cover some areas, but route-local client factories remain common.
- **Risk:** High; service-role clients can bypass RLS, and configuration changes must not weaken authentication.
- **Recommendation:** Consider one narrowly scoped server-only service-client factory for identical configuration. Keep each API route's authorization, ownership checks, and choice of anon versus service key explicit.
- **Safe-to-delete check:** Before merging constructors, compare key selection, auth options, request-scoped cookies/session, runtime requirements, and authorization ordering in every caller. Re-run security and route tests.

#### 4.2 Activity tracking implementation repeated in several files

- **Files involved:** `src/app/(subsystems)/info/api/activity/track/route.js`; `src/app/(subsystems)/info/api/comments/reactions/route.js`; `src/app/(subsystems)/info/api/comments/route.js`; `src/lib/trackActivity.js`
- **Why:** jscpd matched the same 11-line block from the activity route in the comments/reactions route, comments route, and shared activity helper. This is more than stylistic similarity: it appears to repeat activity-tracking behavior.
- **Risk:** High; duplicate event logging can cause inconsistent analytics or access decisions.
- **Recommendation:** Confirm the intended single tracking contract and call the shared helper where equivalent. Preserve event type, actor, target, and failure semantics for each route.
- **Safe-to-delete check:** Compare event payloads, privacy/consent checks, auth context, and tests; verify call counts and analytics after any later refactor.

### Category 5 — Potentially unused files

#### 5.1 Knip candidates requiring manual reference checks

- **Files involved:** Knip reported the following 160 candidates. This is not a verified removal list: Next.js route discovery, service-worker registration, barrel exports, dynamic/string references, and scripts can be missed by static analysis. For example, Knip lists `AdminShell.js` and `AdminDiscussionModeration.js`, while `admin/blogs/page.js` imports them.
- **Why:** The default Knip scan labeled these files unused; no safe deletion was inferred from that label alone.
- **Risk:** High, because this candidate set includes route-facing UI, auth/server helpers, service-worker code, and test/support scripts.
- **Recommendation:** Keep all candidates until each is checked against source imports, App Router conventions, runtime URL strings, build scripts, deployment configuration, and tests. No candidate below is confirmed safe to delete now.
- **Safe-to-delete check:** For each source module, search static and dynamic imports and barrel exports; for pages/routes, check URL generation and framework conventions; for scripts and public assets, check package scripts, CI, HTML, and service-worker registration. Review tests before removal.

**Knip candidate paths:**

```text
public/sw.js
scripts/check-admin-calendar-layout.cjs
scripts/check-user-layout.cjs
scripts/check-user-sections-layout.cjs
scripts/create_confirmed_auth_users.js
scripts/generate-missing-admin-pages.js
scripts/generate-pwa-icons.js
scripts/seed_staff_accounts.js
src/app/(subsystems)/info/admin/dashboard/AdminDashboard.css
src/app/(subsystems)/info/components/admin/AccountStatusSelect.js
src/app/(subsystems)/info/components/admin/AdminAvatar.css
src/app/(subsystems)/info/components/admin/AdminAvatar.js
src/app/(subsystems)/info/components/admin/AdminBadge.js
src/app/(subsystems)/info/components/admin/AdminButton.js
src/app/(subsystems)/info/components/admin/AdminCalendar.css
src/app/(subsystems)/info/components/admin/AdminDiscussionModeration.js
src/app/(subsystems)/info/components/admin/AdminEmptyState.js
src/app/(subsystems)/info/components/admin/AdminNavCard.js
src/app/(subsystems)/info/components/admin/AdminNotificationBell.js
src/app/(subsystems)/info/components/admin/AdminPageHeader.js
src/app/(subsystems)/info/components/admin/AdminPagination.js
src/app/(subsystems)/info/components/admin/AdminPanel.js
src/app/(subsystems)/info/components/admin/AdminShell.js
src/app/(subsystems)/info/components/admin/AdminStatCard.js
src/app/(subsystems)/info/components/admin/AdminTable.js
src/app/(subsystems)/info/components/admin/AdminToolbar.js
src/app/(subsystems)/info/components/admin/index.js
src/app/(subsystems)/info/components/AdminTabRedirect.js
src/app/(subsystems)/info/components/attractions/AttractionCard.js
src/app/(subsystems)/info/components/FrequentlyAskedQuestions.js
src/app/(subsystems)/info/components/home/AnnouncementsTicker.js
src/app/(subsystems)/info/components/home/FeaturedAttractions.js
src/app/(subsystems)/info/components/home/HeroCarousel.js
src/app/(subsystems)/info/components/home/QuickStats.js
src/app/(subsystems)/info/components/home/SearchBar.js
src/app/(subsystems)/info/components/home/TrendingNow.js
src/app/(subsystems)/info/components/home/UpcomingEvents.js
src/app/(subsystems)/info/components/home/WeatherWidget.js
src/app/(subsystems)/info/components/InlineScript.js
src/app/(subsystems)/info/components/MediaUpload.js
src/app/(subsystems)/info/components/MultiMediaUpload.js
src/app/(subsystems)/info/components/NotificationBell.js
src/app/(subsystems)/info/components/profile/ActivityTimeline.js
src/app/(subsystems)/info/components/profile/FollowersList.js
src/app/(subsystems)/info/components/profile/PointsBadges.js
src/app/(subsystems)/info/components/profile/UserProfileCard.js
src/app/(subsystems)/info/components/RouteBreadcrumbs.js
src/app/(subsystems)/info/components/StaffNotificationWidget.js
src/app/(subsystems)/info/components/SuspendedAccountReviewCard.js
src/app/(subsystems)/info/components/user/AccountStatusNotice.js
src/app/(subsystems)/info/components/user/BlogsIndex.js
src/app/(subsystems)/info/components/user/Comments.js
src/app/(subsystems)/info/components/user/DaetWeatherCard.js
src/app/(subsystems)/info/components/user/DailyFeedback.js
src/app/(subsystems)/info/components/user/EventDetailsView.js
src/app/(subsystems)/info/components/user/HashtagSuggest.js
src/app/(subsystems)/info/components/user/InterestSelector.js
src/app/(subsystems)/info/components/user/MediaLightbox.js
src/app/(subsystems)/info/components/user/MentionsAutoSuggest.js
src/app/(subsystems)/info/components/user/MentionText.js
src/app/(subsystems)/info/components/user/MobileNav.js
src/app/(subsystems)/info/components/user/Polls.js
src/app/(subsystems)/info/components/user/PostActionMenu.js
src/app/(subsystems)/info/components/user/PostMediaCarousel.js
src/app/(subsystems)/info/components/user/PostMediaGallery.js
src/app/(subsystems)/info/components/user/PostTimestamp.js
src/app/(subsystems)/info/components/user/ProfileFeedActions.js
src/app/(subsystems)/info/components/user/ProfilePhotoCropper.js
src/app/(subsystems)/info/components/user/QuoteRepostCard.js
src/app/(subsystems)/info/components/user/RatingsReviews.js
src/app/(subsystems)/info/components/user/Reactions.js
src/app/(subsystems)/info/components/user/RealtimeStatus.js
src/app/(subsystems)/info/components/user/RichTextEditor.js
src/app/(subsystems)/info/components/user/ShareRepost.js
src/app/(subsystems)/info/components/user/ShareToDMDialog.js
src/app/(subsystems)/info/components/user/SocialActionBar.js
src/app/(subsystems)/info/components/user/StarRating.js
src/app/(subsystems)/info/components/user/UserProfileLink.js
src/app/(subsystems)/info/components/user/UserSectionHeader.js
src/app/(subsystems)/info/components/user/UserTopHeader.js
src/app/(subsystems)/info/components/visitor/VisitorBackButton.js
src/app/(subsystems)/info/components/visitor/VisitorFooter.js
src/app/(subsystems)/info/components/visitor/VisitorNavbar.js
src/app/(subsystems)/info/visitor/navigation.js
src/app/(subsystems)/info/visitor/VisitorDesktopNavigation.js
src/app/(subsystems)/info/visitor/VisitorMobileHeader.js
src/app/(subsystems)/info/visitor/VisitorScrollEffects.module.css
src/components/AlertToast.js
src/components/CookieConsent.js
src/components/EnableNotificationsButton.js
src/components/PushNotificationPrompt.js
src/components/PwaInstaller.js
src/components/SafeEmbed.js
src/components/SafetyAlertBanner.js
src/components/UserSettingsProvider.js
src/lib/accountAccess.mjs
src/lib/accountLifecycleEmail.js
src/lib/accountStatusServer.js
src/lib/adminApiAuth.js
src/lib/adminAuthorizationPolicy.js
src/lib/adminBackupService.js
src/lib/adminMetrics.js
src/lib/adminRoles.js
src/lib/alertsServer.js
src/lib/analytics.js
src/lib/announcementSchema.js
src/lib/appSettingsServer.js
src/lib/authCookies.js
src/lib/authFlow.js
src/lib/authStorage.js
src/lib/blogModerationService.mjs
src/lib/cache.js
src/lib/clientLogout.js
src/lib/compressImage.js
src/lib/contentRestrictions.js
src/lib/cronAuthorization.js
src/lib/daetDestinationImages.js
src/lib/daetWeather.js
src/lib/emailSettings.js
src/lib/i18n.js
src/lib/imageTrim.js
src/lib/infoUserData.js
src/lib/listingCategoriesServer.js
src/lib/loginPrompt.js
src/lib/mentions.js
src/lib/moderatorReviewEmail.js
src/lib/navigationBreadcrumbs.mjs
src/lib/navigationConfig.mjs
src/lib/notificationAudience.js
src/lib/notificationBellUtils.mjs
src/lib/onboardingUtils.js
src/lib/peopleRecommendationCache.mjs
src/lib/peopleSuggestionScoring.mjs
src/lib/postMedia.js
src/lib/postOwnership.js
src/lib/profileContent.js
src/lib/publicFaqsServer.js
src/lib/pushNotifications.js
src/lib/recommendationService.mjs
src/lib/reportExport.js
src/lib/reviewText.js
src/lib/sanitizeRichText.js
src/lib/securityEmail.js
src/lib/serverPrivacy.js
src/lib/sessionIssue.js
src/lib/sessionVersions.js
src/lib/supabase.js
src/lib/supabaseConfig.js
src/lib/themeBootstrap.js
src/lib/trackActivity.js
src/lib/useAlertFeed.js
src/lib/usePublicSettings.js
src/lib/useRealtimeRefresh.js
src/lib/userSectionUtils.js
src/lib/userSettings.js
src/lib/useScrollReveal.js
src/lib/useUserSearchSuggestions.js
src/lib/useUserSession.js
src/lib/uuid.js
src/lib/visitorContentFilter.js
```

### Category 6 — Duplicate documentation and migrations

#### 6.1 Overlapping Supabase setup documentation

- **Files involved:** `SUPABASE_SETUP.md`; `SUPABASE_IMPLEMENTATION.md`; `SUPABASE_COMPLETE_SUMMARY.md`; `SUPABASE_FILES_INDEX.md`
- **Why:** All four cover setup/migration order, schema or RLS, storage, frontend integration, and checklists. The summary and index also repeat table/function descriptions and quick-start steps. Several refer to absent legacy paths such as `supabase/migrations/001_init_schema.sql`, `002_rls_policies.sql`, `003_functions_and_helpers.sql`, and `src/lib/supabaseUtils.js`; those paths do not exist in the audited tree.
- **Risk:** Medium; stale setup instructions can lead to incorrect database deployment.
- **Recommendation:** Keep one current operational guide as the canonical setup document; merge only still-valid reference material from the other three, then archive/remove superseded copies after review.
- **Safe-to-delete check:** Compare every setup step with the current migration sequence and source modules, then search README links, onboarding notes, and CI/deployment references before deleting any document.

#### 6.2 Duplicate blog approval migration

- **Files involved:** `supabase/migrations/080_blog_admin_approval.sql`; `supabase/migrations/081_blog_admin_approval.sql`
- **Why:** They are byte-for-byte identical and repeat schema updates, policy drops/creation, and moderation trigger/function definitions under two migration IDs.
- **Risk:** High.
- **Recommendation:** Keep migration history immutable once deployed. If both are already applied, document the duplicate and do not delete; if neither has shipped, reconcile migration IDs before release.
- **Safe-to-delete check:** Verify the migration ledger in all Supabase environments and whether either file has been applied or included in a release.

#### 6.3 Ten empty named migrations

- **Files involved:** `supabase/migrations/122_notification_bell_indexes.sql`; `123_unified_moderation_workflow.sql`; `124_suspension_cases.sql`; `125_people_suggestion_cache.sql`; `126_content_recommendation_dismissals.sql`; `132_lift_account_restrictions.sql`; `137_moderation_governance_receipt_fixes.sql`; `138_prevent_duplicate_unresolved_reports.sql`; `139_dedicated_report_management.sql`; `144_restricted_account_community_writes.sql`
- **Why:** Each filename describes a schema/workflow change, but each file is zero bytes. This leaves the migration sequence with named no-op files and makes filenames alone an unreliable indication of the database state.
- **Risk:** High; deployed schema and migration ledger can diverge from repository expectations.
- **Recommendation:** Determine whether each is an intentional no-op, an omitted migration body, or a historical placeholder. Never delete or populate a migration that has already been applied without a migration plan.
- **Safe-to-delete check:** Compare local/remote migration histories and deployed schemas, then check release notes and downstream environments before any change.

## 3. Safe to remove now

**None confirmed.** The exact matches are in use, are route stubs, are zero-byte route/library/migration files, or are tied to deployment history. Knip's unused-file output is not sufficient proof: its list includes components observed in use and code reachable through framework or barrel conventions.

## 4. Merge carefully

- **Supabase setup docs:** reconcile current instructions first; keep one canonical guide and remove outdated overlap only after checking inbound links.
- **Blog routes:** keep the current editing and moderation screens distinct until role permissions and feature parity are compared; simplify only the redirect aliases.
- **Supabase client construction and activity logging:** preserve key selection, authorization ordering, payload semantics, and RLS/security assumptions.
- **Migrations `080`/`081` and the ten empty migrations:** verify every environment's applied migration ledger before any change.
- **The two logo copies and identical receipt/engagement pages:** check all import/URL references and role-specific route behavior before removing or redirecting either.
- **All 160 Knip candidates:** reference-check individually; do not use the tool's list as a bulk deletion plan.

## 5. Suggested cleanup order (safest first)

1. Reconcile and update the overlapping Supabase docs against the actual migration tree; keep deployment instructions explicit.
2. Verify and simplify redirect aliases (`admin/content/blogs`, `admin/content/attractions`, and `admin/data-management`) while preserving canonical destinations and access rules.
3. Standardize logo references only if the public and imported-asset usage can share one source without changing output paths.
4. Review low-risk repeated UI/CSS blocks and factor out only identical behavior, with focused tests/visual checks.
5. Inventory Knip candidates with route-aware import/reference searches; remove only individually verified dead files in a later change.
6. Consolidate common Supabase client setup and activity tracking only after security/behavior tests cover every caller.
7. Review zero-byte and duplicate migrations last, against every environment's migration ledger. Never rewrite already-applied migration history casually.

## 6. Commands used

Commands were run from the project root on Windows. The Unix `find`/`md5sum` example was replaced by a PowerShell SHA-256 scan. `npx.ps1` was blocked by the local execution policy, so the equivalent `npx.cmd` launcher was used.

```powershell
# SHA-256 duplicate scan; excludes requested directories and common build output.
$files = Get-ChildItem -LiteralPath . -File -Recurse | Where-Object {
  $_.FullName -notmatch '[\\](node_modules|\.next|\.git|build|dist|out|coverage)[\\]' -and
  $_.FullName -notmatch '[\\]supabase[\\]\.temp[\\]'
}
$groups = $files | ForEach-Object {
  Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
} | Group-Object Hash | Where-Object Count -gt 1
$groups | ForEach-Object { $_.Group | Select-Object Hash, Path }

# Static-analysis scans. --yes allows npx to run without an interactive prompt.
& "$env:ProgramFiles\nodejs\npx.cmd" --yes knip
& "$env:ProgramFiles\nodejs\npx.cmd" --yes depcheck
& "$env:ProgramFiles\nodejs\npx.cmd" --yes jscpd src --min-lines 10

# Migration prefix and empty-file checks.
Get-ChildItem -LiteralPath 'supabase\migrations' -File -Filter '*.sql' |
  Group-Object { $_.Name.Substring(0, 3) } |
  Where-Object Count -gt 1
Get-ChildItem -LiteralPath 'supabase\migrations' -File -Filter '*.sql' |
  Where-Object Length -eq 0 | Select-Object Name

# Reference and route-name spot checks.
rg -n "createClient\(|createServerClient\(|createBrowserClient\(" src
rg -n "logo\.png|assets/images/logo|/logo\.png" src public
rg -n "/info/admin/(blog|blogs|content/blogs|engagement|analytics/engagement)" src
```

**Tool outcomes:** Knip reported 160 unused-file candidates; jscpd found 163 clones; depcheck printed unused/missing dependency candidates. These are heuristic reports, not proof that a file or dependency is safe to remove.

## Phase 1 cleanup addendum

The following status reflects the controlled cleanup on branch
`chore/connect-daet-codebase-cleanup`. Pre-existing changes to `README.md` and
the untracked `docs/feature-file-map.md` were preserved; the feature map's
Supabase documentation row was updated to identify the canonical guide.

### Zero-byte file classifications

All 33 paths listed in finding 1.4 remain unchanged. Git history indicates
these files were introduced empty; no prior non-empty contents were found, so
none is classified as accidentally emptied. No empty source file is confirmed
to be intentional. The classifications below are conservative and do not
authorize deletion or population:

- **Unfinished implementation:** the empty API routes
  `src/app/(subsystems)/info/api/moderation/receipts/route.js`,
  `src/app/(subsystems)/info/api/moderation/receipts/[id]/pdf/route.js`, and
  `src/app/(subsystems)/info/api/user/content-preferences/route.js`. Their
  paths describe endpoints but contain no handlers. Confirm the expected API
  contracts, callers, and authorization before implementation or removal.
- **Unfinished implementation (provisional):**
  `src/app/(subsystems)/info/report-preview/blog/[id]/page.js`. It is an empty
  dynamic page route. Check notification/report links and external URLs before
  deciding whether the preview is planned or obsolete.
- **Obsolete candidates (not approved for removal):**
  `src/app/(subsystems)/info/components/NotificationBell.js`,
  `src/app/(subsystems)/info/components/admin/AdminNotificationBell.js`,
  `src/app/(subsystems)/info/components/user/BlogsIndex.js`,
  `src/lib/accountAccess.mjs`,
  `src/lib/accountStatusServer.js`,
  `src/lib/adminAuthorizationPolicy.js`,
  `src/lib/cronAuthorization.js`,
  `src/lib/navigationConfig.mjs`,
  `src/lib/notificationBellUtils.mjs`,
  `src/lib/peopleRecommendationCache.mjs`,
  `src/lib/peopleSuggestionScoring.mjs`, and
  `src/lib/recommendationService.mjs`. Each is empty; check direct and dynamic
  imports, route-string references, and intended ownership before changing it.
- **Unfinished tests:** `src/lib/accountAccess.test.mjs`,
  `src/lib/navigationBreadcrumbs.test.mjs`,
  `src/lib/notificationBellUtils.test.mjs`,
  `src/lib/peopleSuggestionScoring.test.mjs`,
  `src/lib/recommendationService.test.mjs`,
  `src/lib/restrictionLiftWorkflow.test.mjs`, and
  `src/lib/suspensionWorkflow.test.mjs`. They currently provide no assertions;
  determine whether they are planned tests or obsolete placeholders before
  populating or removing them.
- **Migration placeholders:** the ten empty SQL files
  `supabase/migrations/122_notification_bell_indexes.sql`,
  `123_unified_moderation_workflow.sql`,
  `124_suspension_cases.sql`,
  `125_people_suggestion_cache.sql`,
  `126_content_recommendation_dismissals.sql`,
  `132_lift_account_restrictions.sql`,
  `137_moderation_governance_receipt_fixes.sql`,
  `138_prevent_duplicate_unresolved_reports.sql`,
  `139_dedicated_report_management.sql`, and
  `144_restricted_account_community_writes.sql`. All ten IDs appear in the
  linked project's migration history. Preserve them; the remote-only
  `147`–`152` IDs and local-only `118` mismatch also remain unresolved. Do not
  push, repair, rewrite, or delete migration history until the release owner
  reconciles authoritative SQL and deployment records.

### Knip candidate classification

Knip's 160 paths remain a review queue, not a bulk-removal list. Manual
reference checks confirmed active/referenced examples:

- `public/sw.js` is registered by `src/components/PwaInstaller.js` and
  `src/lib/pushNotifications.js`, and is used by notification code.
- The admin component barrel
  `src/app/(subsystems)/info/components/admin/index.js` and components such as
  `AdminShell.js` and `AdminDiscussionModeration.js` are imported by admin
  pages; the Knip result is a false positive for these paths.
- `scripts/seed_staff_accounts.js` is documented in `docs/rbac.md`; package
  scripts do not invoke the other listed support scripts, so check CI and
  operator workflows before treating those as obsolete.
- The remaining candidates are **needs manual review**. This includes
  `src/app` components and CSS that may be reached through barrel/dynamic
  imports, `src/lib` modules that may be referenced by runtime strings or
  tests, and scripts/assets with deployment or operator use. No individual
  file was confirmed safe to delete.

Checks included source searches for admin component imports, service-worker
registration, candidate script names, and the package script list. Because
static searches cannot establish absence of dynamic/runtime references, the
remaining candidates are explicitly not classified as removable.

### Routes, duplication, and optimization decisions

- `/info/admin/content/blogs` now redirects directly to `/info/admin/blog`;
  `/info/admin/content/attractions` redirects directly to
  `/info/admin/tourist-spots`. These retain the legacy URLs and avoid the
  intermediate `/admin/content?tab=...` redirect. The matching staff-role
  requirements were checked; the editing route `/admin/blog` and moderation
  route `/admin/blogs` remain separate.
- `/info/admin/data-management` remains a compatibility redirect to
  `/info/admin/data`. Both engagement aliases remain redirects to
  `/info/admin/analytics#engagement`; no distinct engagement workflow was
  found that justifies merging them.
- The four root Supabase documents now direct readers to `SUPABASE_SETUP.md`,
  the canonical operations guide. `supabase/README.md` summarizes the current
  directory layout and points to that guide. Migration IDs and the linked
  history discrepancy were verified read-only; no migration file changed.
- No shared-code extraction was made from jscpd clones. Authentication
  flows, notification handlers, route entity maps, service-role client setup,
  activity tracking, and CSS occur in different permission, request, selector,
  or cascade contexts. Extract only after caller-by-caller contract tests.
- Removed the unused direct dependencies `@fullcalendar/list`,
  `@supabase/ssr`, and `qrdev` from `package.json` and the lockfile after source
  and script-reference checks. This cleanup has not been presented as a
  measured bundle-size improvement.
- No image, pagination, query, caching, or component-rendering rewrite was
  made. The analytics engagement page still loads up to 1,000 rows per table
  and paginates client-side; changing its API contract needs a separate review.

### Safe-to-remove and merge status

- **Safe to remove now:** none of the project files. No zero-byte file or Knip
  candidate is confirmed removable.
- **Merge carefully:** retain both blog editing and moderation screens; keep
  the byte-identical applied migrations `080`/`081` and all ten empty applied
  migration IDs immutable; preserve route-specific auth/data behavior in
  duplicated handlers; consider client-side analytics pagination only with a
  backward-compatible API review.
- **Suggested next order:** (1) reconcile remote/local migration history with
  the release owner; (2) resolve intent and references for empty routes,
  tests, components, and utilities; (3) perform a route-aware review of
  remaining Knip candidates; (4) add contract tests before extracting any
  auth, notification, activity, or Supabase helper; (5) measure the analytics
  query bottleneck before designing pagination.

### Phase 1 validation and commands

Baseline checks before cleanup: `npm test` passed (269 tests);
`npm run build` passed; `npm run lint` failed with 2 errors and 154 warnings.
After cleanup, `npm test` again passed (269 tests), and the full lint run
reported the same 2 errors and 154 warnings. The pre-existing errors are
`react-hooks/set-state-in-effect` in
`src/app/(subsystems)/info/user/dashboard/page.js:836` and
`react/jsx-no-undef` (`MessageCircle`) in
`src/app/(subsystems)/info/visitor/tourist-spots/[id]/page.js:471`; neither
file was changed by this cleanup. `npm run build` passed after cleanup, and
the production route manifest contains both legacy aliases, their canonical
destinations, the data-management redirect, and both engagement aliases.
`git diff --check` also completed cleanly.

```powershell
git status --short
git switch -c chore/connect-daet-codebase-cleanup
npx supabase migration list --linked
npm uninstall @fullcalendar/list @supabase/ssr
npm uninstall --save-dev qrdev
npm test
npm run lint
npm run build
```
