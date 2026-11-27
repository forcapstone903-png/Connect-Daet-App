# Connect Daet Feature and File Map

This document maps the application's implemented feature areas to their main
pages, API routes, shared code, database migrations, tests, and documentation.
Use it with [README.md](../README.md) and the route-level files for details.
`/info` is a Next.js URL segment and `(subsystems)` is only a route group.

## 1. Application entry points

| Area | Main files |
|---|---|
| Next.js root layout | `src/app/layout.js`, `src/app/globals.css` |
| Main root page | `src/app/page.js` |
| Route and access control proxy | `src/proxy.js`, `src/lib/serverAuth.js`, `src/lib/publicRoutes.js`, `src/lib/accountAccess.mjs`, `src/lib/adminRolePolicy.mjs`, `src/lib/staffRoles.mjs` |
| Supabase browser/server connection | `src/lib/supabase.js`, `src/lib/supabaseConfig.js` |
| Shared user settings provider | `src/components/UserSettingsProvider.js`, `src/lib/userSettings.js`, `src/lib/themeBootstrap.js` |
| Public route structure | `src/app/(subsystems)/info/visitor/layout.js`, `src/app/(subsystems)/info/visitor/navigation.js` |
| User route structure | `src/app/(subsystems)/info/user/layout.js`, `src/app/(subsystems)/info/user/user-sections.css` |
| Admin route structure | `src/app/(subsystems)/info/admin/layout.js`, `src/app/(subsystems)/info/components/AdminSidebar.js` |

## 2. Public tourism discovery

| Feature | Pages and components | APIs | Shared code and database | Tests/docs |
|---|---|---|---|---|
| Visitor landing page | `src/app/(subsystems)/info/visitor/page.js`, `VisitorMobileHeader.js`, `VisitorDesktopNavigation.js`, `components/home/*` | `api/alerts/route.js`, `api/weather/route.js`, `api/analytics/visits/route.js` | `listings.mjs`, `daetWeather.js`, `alertsServer.js`, migrations `064`, `097`, `098` | `docs/visitor-page.md`, `docs/places-directory.md` |
| Tourist spots directory | `visitor/tourist-spots/page.js`, `components/attractions/AttractionCard.js` | `api/admin/tourist-spots/route.js`, `api/admin/tourist-spots/[id]/route.js` | `listings.mjs`, `touristSpotGeocoding.mjs`, migrations `097`, `112` | `listings.test.mjs`, `touristSpotGeocoding.test.mjs`, `docs/places-directory.md` |
| Tourist spot details | `visitor/tourist-spots/[id]/page.js` | `api/reports/route.js`, `api/user/favorites/route.js` | `ratings.mjs`, `daetDestinationImages.js`, migrations `068`, `069`, `109`, `119`-`121` | `ratings.test.mjs`, `docs/places-directory.md` |
| Public event discovery | `visitor/events/page.js`, `visitor/events/[id]/page.js` | `api/user/events/route.js`, `api/user/events/[id]/route.js`, `api/user/events/[id]/registration/route.js`, `api/user/events/calendar/route.js` | `eventCalendar.js`, migrations `010`, `056`, `082`, `114`, `115` | `eventCalendar.test.js`, `docs/visitor-page.md` |
| Public blogs and stories | `visitor/blog/[id]/page.js`, `visitor/search/page.js` | `api/user/blogs/route.js`, `api/user/blogs/[id]/route.js`, `api/blog-comments/route.js` | `blogModerationService.mjs`, migrations `080`, `088`-`091`, `110`, `127` | `blogModeration*.test.mjs`, `docs/hybrid-post-moderation.md` |
| Public forums | `visitor/forum/page.js`, `visitor/forum/[id]/page.js`, `components/user/Polls.js` | `api/admin/forum/route.js`, `api/admin/forum/[id]/route.js`, `api/forum-replies/route.js` | migrations `045`-`046`, `052`-`053`, `057`, `118` | `commentSafety.test.mjs`, `docs/hybrid-post-moderation.md` |
| Public search | `visitor/search/page.js`, `user/search/page.js` | `api/search/users/route.js`, `api/user/discover/route.js`, `api/user/recommendations/route.js` | `useUserSearchSuggestions.js`, `visitorContentFilter.js`, migrations `125`-`127` | `docs/visitor-page.md`, `docs/places-directory.md` |
| Public alerts | `visitor/alerts/page.js`, `visitor/alerts/[id]/page.js`, `components/alert/*` only if present in the route | `api/alerts/route.js`, `api/alerts/[id]/opened/route.js`, `api/alerts/preferences/route.js`, `api/alerts/guest-subscription/route.js` | `alerts.mjs`, `alertsServer.js`, migrations `098`, `038`-`040` | `alerts.test.mjs`, `docs/alerts.md`, `docs/notification-delivery.md` |
| Announcement and emergency information | `visitor/page.js`, `user/announcements/page.js`, `user/announcements/[id]/page.js` | `api/admin/alerts/route.js`, `api/admin/content-notifications/route.js` | `announcementSchema.js`, migration `021` | `docs/alerts.md` |
| About, contact, and FAQs | `about/page.js`, `contact/page.js`, `components/FrequentlyAskedQuestions.js` | `api/faqs/route.js`, `api/contact/inquiry/route.js` | `faqValidation.mjs`, `publicFaqsServer.js`, migration `111` | `faqFeature.test.mjs` |
| Legal and accessibility pages | `legal/*/page.js`, `legal/_components/LegalBackButton.js` | `api/community-guidelines/route.js` | `src/app/(subsystems)/info/community-guidelines/page.js` | `docs/user-guide.md` |

## 3. Authentication and account security

| Feature | Main files |
|---|---|
| Login, logout, and session | `(auth)/login/page.js`, `api/login/route.js`, `api/logout/route.js`, `src/lib/authFlow.js`, `src/lib/authCookies.js`, `src/lib/serverAuth.js`, `src/lib/sessionVersions.js`, `src/lib/clientLogout.js` |
| Registration and email confirmation | `(auth)/register/page.js`, `(auth)/confirm/page.js`, `api/register/route.js`, `api/resend-verification/route.js`, `api/auth/confirm-email/route.js`, `api/account/status/route.js` |
| Password recovery | `(auth)/forgot-password/page.js`, `(auth)/reset-password/page.js`, `(auth)/account-recovery/page.js`, `api/forgot-password/route.js`, `api/reset-password/route.js`, `api/account/recovery/route.js` |
| Password policy and lockout | `src/lib/passwordPolicy.js`, `src/lib/loginLockout.js`, `src/lib/rateLimit.js`, migrations `071`, `094` |
| Account lifecycle and deletion | `account-appeal/page.js`, `account-suspended/page.js`, `api/account/lifecycle/route.js`, `api/cron/account-deletions/route.js`, `src/lib/accountLifecycleEmail.js`, migrations `051`, `072`, `087`, `143`-`146` |
| Session and account status checks | `src/lib/accountStatusServer.js`, `src/lib/accountAccess.mjs`, `src/lib/sessionIssue.js`, `src/lib/useUserSession.js`, proxy in `src/proxy.js` |

## 4. User dashboard, profile, and settings

| Feature | Pages | APIs | Shared code | Migrations/docs/tests |
|---|---|---|---|---|
| User dashboard | `user/dashboard/page.js`, `user/page.js` | `api/user/feed/route.js`, `api/user/recommendations/route.js`, `api/user/content-preferences/route.js` | `feedOrdering.js`, `feedRecommendationEngine.js`, `personalizedRecommendationScoring.mjs`, `recommendationService.mjs` | migrations `075`, `126`, `127`; feed/recommendation tests |
| Profile and edit | `user/profile/page.js`, `profile/[id]/page.js`, `profile/edit/page.js`, `profile/connections/page.js`, `profile/archive/page.js` | `api/profile/route.js`, `api/users/[id]/route.js`, `api/users/[id]/follow/route.js`, `api/users/followers/route.js`, `api/users/following/route.js`, `api/users/[id]/block/route.js` | `profileContent.js`, `userSocialDisplay.js`, components `profile/*` | migrations `077`, `104`, `105`; `docs/user-guide.md` |
| Onboarding and interests | `user/onboarding/page.js`, `api/user/interests/route.js` |  | `onboardingUtils.js`, `userInterests.js`, components `user/InterestSelector.js` | migration `006`; `userInterests.test.mjs` |
| Settings | `user/settings/page.js`, `_components/*` | `api/user/settings/route.js`, `api/user/password/route.js`, `api/user/data-export/route.js` | `i18n.js`, `userSettings.js`, `settingsEnforcement.test.mjs`, `docs/user-settings.md` | migrations `050`, `051`, `102` |
| Saved items | `user/saved/page.js` | `api/user/favorites/route.js` | `src/lib/postOwnership.js`, components `PostActionMenu.js` | migration `069` |
| User drafts | `user/drafts/page.js`, `user/blog-submissions/page.js`, `user/event-submissions/page.js` | `api/user/blogs/route.js`, `api/user/events/route.js` | blog and event moderation services | migrations `080`-`082`, `088`-`091` |

## 5. Community participation

| Feature | Main pages/components | APIs | Shared code and migrations |
|---|---|---|---|
| Posts and reposts | `user/posts/[id]/page.js`, `components/user/ShareRepost.js`, `QuoteRepostCard.js`, `PostMedia*`, `SocialActionBar.js` | `api/posts/route.js`, `api/posts/[id]/route.js`, `api/reposts/[id]/route.js` | `postContent.js`, `postMedia.js`, `repostIdentity.js`, migrations `004`, `048`-`049`, `055`, `078` |
| Comments and reactions | `components/user/Comments.js`, `components/user/Reactions.js`, `components/user/MentionText.js` | `api/comments/route.js`, `api/comments/reactions/route.js`, `api/reactions/route.js`, `api/blog-comments/route.js` | `commentThreads.js`, `commentSafety.mjs`, `mentions.js`, migrations `005`, `007`, `014`, `117`-`118` |
| Blog creation and management | `user/blogs/new/page.js`, `blogs/[id]/page.js`, `blogs/[id]/edit/page.js` | `api/user/blogs/route.js`, `api/user/blogs/[id]/route.js` | `blogModerationService.mjs`, `sanitizeRichText.js`, migrations `080`, `127` |
| Forum discussions | `user/forums/[id]/page.js`, public forum pages | `api/forum-replies/route.js`, `api/admin/forum/route.js`, `api/admin/forum/categories/route.js` | `Polls.js`, migrations `045`-`046`, `052`-`053`, `057`, `053` |
| Following and blocking | profile and connection pages | `api/users/[id]/follow/route.js`, `api/users/following/route.js`, `api/users/followers/route.js`, `api/users/[id]/block/route.js` | migrations `032`, `077`, `104` |
| Direct messaging | `user/messaging/page.js`, `[id]/page.js`, `[id]/pinned/page.js`, `archived/page.js` | `api/messages/route.js`, `api/messages/[id]/route.js`, `api/messages/[id]/pinned/route.js`, `api/messages/reactions/route.js`, `api/gifs/route.js` | `messagePinActivity.js`, migrations `011`, `015`-`017`, `033`, `041`, `047`, `054`, `058`-`060`, `116` |
| Reviews and daily feedback | attraction detail, `user/feedback/page.js`, admin feedback pages | `api/daily-feedback/route.js`, `api/admin/feedback/route.js`, `api/admin/reviews/route.js` | `ratings.mjs`, `reviewText.js`, migrations `068`, `109`, `119`-`121` |
| Rewards | `user/rewards/page.js` | `api/rewards/catalog/route.js`, `api/rewards/redeem/route.js`, `api/admin/rewards/route.js` | `gamification.js`, `rewardSettings.mjs`, migration `086` |

## 6. Notifications, push, and alerts

| Feature | Main files |
|---|---|
| In-app notification pages | `user/notifications/page.js`, `components/NotificationBell.js`, `components/StaffNotificationWidget.js`, `admin/notifications/*/page.js` |
| Notification API | `api/notifications/route.js`, `api/admin/alerts/route.js`, `api/admin/content-notifications/route.js`, `api/admin/messages/route.js` |
| Push subscription and browser prompt | `src/components/PushNotificationPrompt.js`, `src/components/EnableNotificationsButton.js`, `src/lib/pushNotifications.js`, `src/lib/pushSubscriptionValidation.mjs`, `public/sw.js` |
| Staff notification scope | `src/lib/adminNotifications.js`, `src/lib/staffNotificationScope.mjs`, `src/lib/staffNotificationWidget.mjs`, `src/lib/notificationAudience.js`, `src/lib/notificationBellUtils.mjs` |
| Alert delivery | `src/lib/alerts.mjs`, `src/lib/alertsServer.js`, `src/lib/useAlertFeed.js`, migrations `098`, `038`-`040`, `043` |
| Supabase push edge function | `supabase/functions/push/index.ts`, `supabase/functions/push/README.md` |
| Deployment documentation | `docs/notification-delivery.md`, `docs/web-push-vite-setup.md`, `supabase/README.md`, `public/sw.js` |
| Migration and delivery tests | `src/lib/notificationBellUtils.test.mjs`, `src/lib/userNotificationDelivery.test.mjs`, `src/lib/staffNotificationWidget.test.mjs`, `src/lib/alerts.test.mjs` |

## 7. Moderation, reporting, appeals, and safety

| Feature | Pages/components | APIs | Shared code and database |
|---|---|---|---|
| Report submission and management | `admin/report-management/[role]/page.js`, `[role]/[id]/page.js`, `components/admin/AdminDiscussionModeration.js` | `api/reports/route.js`, `api/admin/report-management/route.js` | `moderationWorkflow.mjs`, migrations `123`, `138`-`140` |
| Community moderation queue | `admin/moderation/page.js`, `admin/moderation/receipts/page.js`, `admin/community/moderation/page.js` | `api/admin/moderation/route.js`, `api/admin/moderation/comments/route.js`, `api/admin/moderation/user-content/route.js` | `commentSafety.mjs`, `profanityFilter.mjs`, migrations `099`, `107`, `123`, `127` |
| Blog moderation | `admin/blog/page.js`, `admin/blogs/page.js`, `admin/content/blogs/page.js` | `api/admin/blogs/route.js`, `api/admin/blogs/[id]/route.js` | `blogModerationService.mjs`, migrations `080`, `088`-`091`, `127` |
| Profanity and content safety | admin moderation pages and comment/post components | moderation/comment APIs | `profanityFilter.mjs`, `commentSafety.mjs`, migrations `099`, `118` |
| Account suspension and restrictions | `account-suspended/page.js`, `admin/suspension-cases/page.js`, `admin/suspension-reviews/page.js`, `admin/account-oversight/page.js` | `api/admin/suspension-cases/route.js`, `api/admin/suspension-reviews/route.js`, `api/admin/moderation/suspension-review/route.js`, `api/admin/account-oversight/route.js` | `suspensionDuration.mjs`, `suspensionWorkflow.test.mjs`, migrations `124`, `128`-`135`, `140`-`146` |
| Moderation appeals | `user/moderation-appeals/page.js`, `user/moderation-details/page.js`, `user/moderation-receipts/page.js` | `api/user/moderation-appeals/route.js`, `api/user/moderation-details/route.js`, `api/moderation/receipts/route.js` | `moderationAppealEvidence.mjs`, `contentDeletionNotifications.mjs`, migration `131` |
| Moderation receipts | `admin/moderation/receipts/page.js`, `api/moderation/receipts/[id]/pdf/route.js` | `api/moderation/receipts/route.js` | migration `136`, `137` |
| Reported account investigations | `admin/account-oversight/page.js`, `admin/report-management/*` | `api/admin/account-oversight/route.js`, `api/admin/report-management/route.js` | `accountInvestigationWorkflow.test.js`, `accountOversightWorkflow.test.js`, migrations `108`, `140`, `142` |

## 8. Administration

| Feature | Pages | APIs | Shared code and migrations |
|---|---|---|---|
| Role-based admin dashboard | `admin/dashboard/page.js`, `admin/tourism-dashboard/page.js`, `admin/moderator-dashboard/page.js`, `admin/page.js` | `api/admin/me/route.js`, `api/admin/system-health/route.js` | `staffRoles.mjs`, `adminAuthorizationPolicy.js`, `adminApiAuth.js`, migrations `096`, `101`, `103`, `134`-`135` |
| Tourist spot management | `admin/tourist-spots/page.js`, `admin/content/attractions/page.js` | `api/admin/tourist-spots/route.js`, `[id]/route.js`, `geocode/route.js` | `listings.mjs`, `touristSpotGeocoding.mjs`, migrations `097`, `112` |
| Event management and approvals | `admin/events/page.js`, `admin/event-approvals/page.js` | `api/admin/events/route.js`, `[id]/route.js`, registrations and reminder routes | `eventCalendar.js`, migrations `010`, `082`, `114`, `115` |
| Blog/content management | `admin/blog/page.js`, `admin/blogs/page.js`, `admin/content/blogs/page.js`, `admin/content/page.js` | `api/admin/blogs/route.js`, `api/admin/blogs/[id]/route.js` | `blogModerationService.mjs`, migrations `080`, `088`-`091`, `127` |
| User and account management | `admin/users/page.js`, `admin/account-oversight/page.js`, `admin/community/users/page.js` | `api/admin/users/route.js`, `api/admin/account-oversight/route.js` | `infoUserData.js`, `accountStatusServer.js`, migrations `096`, `142`, `145`-`146` |
| Admin profile and account security | `admin/account/page.js`, `profile/page.js`, `password/page.js`, `2fa/page.js`, `sessions/page.js` | `api/admin/me/route.js`, `api/admin/security/login-failures/route.js` | `authCookies.js`, `sessionVersions.js`, migration `094` |
| Staff messaging | `admin/staff-chat/page.js` | `api/admin/staff-chat/route.js` | migration `106` |
| Forum and community management | `admin/forum/page.js`, `admin/community/forum/page.js`, `admin/community/page.js`, `admin/community/feedback/page.js` | `api/admin/forum/route.js`, `api/admin/forum/categories/route.js`, `api/admin/feedback/route.js` | migrations `045`-`046`, `052`-`053`, `057` |
| Announcements and notifications | `admin/announcement/page.js`, `admin/announcement-settings/page.js`, `admin/alerts/page.js`, `admin/notifications/*/page.js` | `api/admin/alerts/route.js`, `api/admin/content-notifications/route.js` | `adminNotifications.js`, `announcementSchema.js`, migration `021` |
| FAQs and community guidelines | `admin/faqs/page.js`, `admin/community-guidelines/page.js` | `api/admin/faqs/route.js`, `api/admin/community-guidelines/route.js` | `faqValidation.mjs`, migrations `111` |
| Site settings and maintenance | `admin/settings/*/page.js`, `admin/settings/_components/*` | `api/admin/settings/route.js`, `api/admin/settings/email/route.js`, `api/admin/settings/maintenance/route.js`, `api/site-settings/route.js` | `appSettingsServer.js`, `emailSettings.js`, `siteSettings.mjs`, migrations `065`, `084`, `102` |
| Data, media, and backups | `admin/data-management/page.js`, `admin/file-management/page.js`, `admin/data/*/page.js` | `api/admin/media/route.js`, `api/admin/data-management/route.js`, `api/admin/data-management/backup/route.js`, `api/admin/data-management/backups/route.js`, `api/upload/route.js` | `adminBackupService.js`, `adminDataBackup.js`, `uploadValidation.js`, migrations `084`, `095` |

## 9. Analytics, reports, and privacy

| Feature | Main files |
|---|---|
| Analytics dashboard | `admin/analytics/page.js`, `admin/analytics/EngagementSection.js`, `admin/analytics/content/page.js`, `admin/analytics/engagement/page.js`, `admin/analytics/reports/page.js`, `admin/analytics/visitors/page.js` |
| Analytics API and exports | `api/admin/analytics/route.js`, `api/analytics/visits/route.js`, `api/admin/data-management/route.js` |
| Analytics shared code | `src/lib/adminAnalytics.mjs`, `src/lib/adminMetrics.js`, `src/lib/siteAnalytics.js`, `src/lib/reportExport.js`, `src/components/SiteVisitTracker.js` |
| Visitor privacy and consent | `src/components/CookieConsent.js`, `src/lib/serverPrivacy.js`, `src/lib/siteSettings.mjs`, migrations `062`, `063` |
| Documentation | `docs/site-visit-analytics.md`, `docs/caching.md`, `docs/notification-delivery.md` |
| Tests | `src/lib/adminAnalytics.test.mjs`, `src/lib/siteAnalytics.test.js`, `src/lib/reportExport.js` |

## 10. PWA and cross-cutting interface

| Feature | Main files |
|---|---|
| PWA installer and manifest | `src/components/PwaInstaller.js`, `public/manifest.webmanifest`, `public/sw.js`, `public/icon-*.png`, `public/icon-connect-daet-*.png` |
| Theme, appearance, and motion | `src/lib/themeBootstrap.js`, `src/lib/i18n.js`, `src/app/globals.css`, user settings appearance/language components |
| Global notifications and alerts | `src/components/AlertToast.js`, `src/components/SafetyAlertBanner.js`, `src/components/PushNotificationPrompt.js` |
| Shared UI helpers | `src/app/(subsystems)/info/components/*`, `src/app/(subsystems)/info/components/admin/*`, `src/app/(subsystems)/info/components/user/*`, `src/app/(subsystems)/info/components/visitor/*` |
| Offline and cache behavior | `public/sw.js`, `src/lib/cache.js`, `docs/caching.md` |

## 11. Database and Supabase configuration

| Area | Files |
|---|---|
| Core migrations | `supabase/migrations/001_complete_database.sql` through `supabase/migrations/146_account_suspension_reviews.sql` |
| Local Supabase configuration | `supabase/config.toml`, `supabase/README.md`, `supabase/.temp/` |
| Push function | `supabase/functions/push/index.ts`, `supabase/functions/push/README.md` |
| Setup and deployment | `SUPABASE_SETUP.md` (canonical), `supabase/README.md`, `docs/rbac.md` |
| Cron routes | `api/cron/account-deletions/route.js`, `api/cron/admin-messages/route.js`, `api/cron/alerts/route.js`, `api/cron/backups/route.js`, `api/cron/moderation-lifecycle/route.js` |

## 12. Tests and validation

The primary Node test suite is under `src/lib/*.test.js` and `src/lib/*.test.mjs`.
The Playwright smoke-test entry point is `tests/example.spec.js`, configured by
`playwright.config.js`.

Relevant validation areas include authentication, account access, RBAC,
moderation, suspension and appeal workflows, notifications, push subscriptions,
ratings, tourist spots, alerts, backups, settings enforcement, social features,
recommendations, and security hardening.

Run the repository scripts:

```bash
npm test
npm run lint
npm run build
npm run dev
npx playwright test
```
