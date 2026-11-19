# Connect Daet User Guide

Connect Daet is a mobile-friendly tourism and community website for Daet,
Camarines Norte. Visitors can explore local information; registered users can
participate in the community; and authorized staff can manage content and
moderation.

The pages and actions available to you depend on whether you are browsing as a
visitor, signed in as a user, or signed in with a staff role. Some features also
depend on published content, browser permissions, and the system's deployment
configuration.

## Contents

- [Getting started](#getting-started)
- [For visitors](#for-visitors)
- [For registered users](#for-registered-users)
- [Account settings and privacy](#account-settings-and-privacy)
- [For staff](#for-staff)
- [Account suspension reviews](#account-suspension-reviews)
- [Notifications and browser alerts](#notifications-and-browser-alerts)
- [Troubleshooting](#troubleshooting)
- [Help and legal information](#help-and-legal-information)

## Getting started

### Open the website

Open the Connect Daet website in a supported browser. The public visitor
homepage is available at `/info/visitor`. You can browse public pages without
an account.

### Create an account

1. Select **Register** or open `/info/register`.
2. Enter the requested account details and create a password that meets the
   requirements shown on the page.
3. Check your email and follow the confirmation link if email confirmation is
   enabled for the site.
4. Sign in at `/info/login`.

Use `/info/forgot-password` if you need to reset your password. Follow the
email instructions and use the recovery link before it expires. Never share
your password or recovery link.

### Sign out

Use the profile menu or **Log out** control. On a shared device, always sign
out and close the browser window when you are finished.

## For visitors

Visitors can view published, public information. Sign-in is required for
personalized features and most community participation.

### Find places and plan a visit

1. Open **Places** or `/info/visitor/tourist-spots`.
2. Search by destination name, location, category, or description.
3. Select a place to open its details.
4. Review the description, images, map, hours, fees, contact details, and
   visitor reviews when those details are available.
5. Confirm important travel details with the local provider before leaving.
   Listing information may be incomplete or out of date.

Some destination details support saving a place to your personal trip list.
Saving requires a signed-in account.

### Find events, stories, and discussions

- Browse published upcoming events at `/info/visitor/events`.
- Read published local stories from the homepage or open
  `/info/visitor/search?type=blogs`.
- Browse public forum discussions at `/info/visitor/forum`.
- Use `/info/visitor/search` to search across the available destinations,
  events, blogs, discussions, people, and community activity.

Public content appears only when it is published and available to visitors.
Some forum details and participation features require sign-in.

### View announcements and alerts

Open the visitor **Alerts** page at `/info/visitor/alerts` to view current
public notices. The visitor homepage may also show announcements, events,
emergency contact details, and discovery shortcuts.

## For registered users

After signing in, use the user navigation to open your dashboard, profile,
messages, saved items, alerts, rewards, and other account features.

### Dashboard and profile

- **Dashboard** (`/info/user/dashboard`): view your personalized feed and
  community activity.
- **Profile** (`/info/user/profile`): view and manage your profile and
  supported profile activity.
- **Edit profile** (`/info/user/profile/edit`): update the profile information
  the site allows you to change.
- **Saved** (`/info/user/saved`): revisit supported saved destinations and
  other saved content.
- **Notifications** (`/info/user/notifications`): review your in-app
  notification inbox.

Profile visibility affects what other people can see. Do not post personal
information that you do not want to share.

### Publish and manage content

1. Select **Create** or open `/info/user/blogs/new`.
2. Enter the requested content and submit it.
3. Check **Blog submissions**, **Drafts**, or **Event submissions** to review
   your own content and its status.

Community posts, blogs, comments, forum topics, and replies may be held for
moderator review before they are visible. Follow the community guidelines and
check the item's status if it does not appear publicly.

### Participate in the community

Depending on the page and your account status, you can comment, reply, react,
follow or block users, and create or share community posts. Use the content's
available controls to make changes to your own items or report content that
may violate the community guidelines.

### Forums and messaging

- Open **Forum** to browse discussions or create a topic when permitted.
- Open **Messages** to view conversations and send direct messages.
- Use the conversation controls to react, pin, or manage messages where those
  options are available.
- Archived conversations are available from the messaging area.

Do not use messages to send passwords, account recovery links, or sensitive
personal information.

### Feedback and rewards

- Submit supported feedback from the relevant page or dashboard prompt.
- Open **Rewards** (`/info/user/rewards`) to view available rewards and your
  redemption information.
- Rewards and points are subject to the options currently configured by the
  administrators.

### Posting restriction appeals

The **Posting appeals** page (`/info/user/moderation-appeals`) lets eligible
signed-in users review an active posting restriction and submit an appeal.
Enter a clear explanation and include relevant context. The page also shows
available appeal history and moderator notes.

An account suspension that blocks sign-in is different from a posting
restriction. Follow the instructions shown by the site when sign-in is
blocked; do not assume the posting-appeal form is available for every type of
restriction.

## Account settings and privacy

Open **Settings** at `/info/user/settings`. Available categories include:

- **Profile information:** manage supported personal and profile details.
- **Security and authentication:** change or recover your password and review
  available sign-in information.
- **Notifications:** manage supported in-app notification preferences.
- **Privacy and data:** review privacy controls, personal-data export, and
  local-data options.
- **Appearance:** choose light, dark, or system appearance and reduced motion.
- **Language and region:** choose from the available English, Filipino, and
  Bikol settings. Some parts of the site may still appear in English.
- **Account management:** access supported deactivation or deletion-request
  options.

If you request account deletion, read the deadline and recovery information
shown on the page. A pending deletion may be recoverable only before its
deadline. Do not assume deleting an account immediately removes every record
or file; retention and deletion behavior depends on the system configuration.
Temporary deactivation signs you out; signing in again presents the
reactivation option. An owner-requested deletion has a 30-day recovery period.

### Privacy choices

If the site asks for analytics consent, your choice controls whether eligible
public page visits are recorded for aggregate analytics. Use **Privacy
settings** to change or withdraw consent. Analytics totals may be estimates
and should not be treated as a count of verified people.

## For staff

Staff use the shared console at `/info/admin`. Your assigned role determines
which pages and actions are available. If you do not see a menu item or receive
an access-denied message, contact an administrator rather than using another
person's account.

A floating notification bell stays in the lower-right corner of staff pages.
New staff notifications appear there without reloading the current page; select
the bell or **View notification inbox** to open the staff inbox.

| Role | Main responsibilities |
| --- | --- |
| Tourism Officer | Manage tourism listings and events, broadcast alerts, handle feedback, and view permitted analytics. |
| Moderator | Review community content and reports, manage forum areas, review eligible suspension cases, and access permitted user information. |
| Administrator | Manage staff and system settings, oversee content and moderation, and access authorized system, backup, and audit tools. |

### Tourism Officer tasks

- **Places Directory:** create or update destination listings and their
  public details.
- **Events:** manage event details and schedules; use the event-approval
  queue where applicable.
- **Alert Broadcasts:** create or manage public alert information. Verify the
  audience and message before sending.
- **Feedback and Reviews:** read and respond to supported visitor feedback.
- **Analytics:** review permitted reports and exports. Treat estimates and
  aggregate statistics according to their definitions.

### Moderator tasks

- **Reported Content:** investigate reports and review submitted or flagged
  content before taking action.
- **Profanity filter:** add a word or phrase per line. Punctuation in terms is
  normalized away; Unicode letters are accepted. Matching normalizes case,
  number substitutions, repeated letters, and symbol masking. Matches enter
  the review queue; the filter does not automatically hide published content.
  After review, moderators can warn the author, hide the content, or remove it.
- **Blog and community moderation:** review submissions and apply the actions
  available for the relevant content.
- **Forum:** manage discussions and forum categories where permitted.
- **Account Suspension Reviews:** inspect the suspension reason, report,
  available evidence, appeal, prior warnings, and review history before
  deciding.
- **Community Guidelines:** read and maintain the published guidance if
  authorized.
- **Announcements:** publish official announcements where your role has
  access.

For account suspension reviews, choose **Uphold**, **Lift**, **Modify**, or
**Request information** only after reviewing the case. Enter a review note
explaining the decision; the note is required and becomes part of the case
history. The system records the reviewer and time and notifies the affected
user. If you initiated the original suspension, another eligible staff member
must review that case.

### Administrator tasks

Administrators can access the system areas permitted by their account,
including:

- Staff and tourist account management and role assignment.
- System settings, maintenance, categories, and notification configuration.
- Analytics, activity logs, data-management, and backup tools.
- Content, community, and moderation oversight.

Use administrative powers only for authorized work. Verify the target account
and intended change before saving. Keep credentials and service configuration
private, and follow the organization's backup, retention, and incident
procedures.

## Account suspension reviews

This section is for moderators and administrators with access to the review
queue. The queue is available only after the account-suspension-review feature
and its database migration have been deployed.

1. Open **Account Suspension Reviews** from the **Moderation** section.
2. Select a case and review the account profile, suspension reason, original
   duration, report or reported content, user appeal if present, prior
   warnings, and review history.
3. Compare the available evidence with the community guidelines. Open the
   reported content or moderation report when a link is available.
4. Select an appropriate outcome:
   - **Uphold suspension:** keep the existing suspension.
   - **Lift suspension:** restore access by lifting the suspension.
   - **Modify suspension:** set a shorter suspension duration.
   - **Request information:** leave the case unresolved and notify the user
     that more information is requested.
5. Enter a clear review note and submit the decision.

Do not approve or uphold cases automatically. Record the evidence considered
and the reason for the decision in the required note. Check the case status
after submission; the queue can be refreshed to display the latest result.

## Notifications and browser alerts

In-app notifications are available from the notification inbox and relevant
navigation controls. Browser push notifications are optional and require a
supported browser, site configuration, and your permission.

To enable browser notifications, use the site's notification control and
choose **Allow** in the browser prompt. If you decline or block permission,
in-app notifications may still be available. Browser push delivery is not
guaranteed and may not be configured on every deployment. On some iOS
devices, push requires adding the site to the Home Screen first.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| You cannot sign in | Check your email and password, confirm your email if requested, and use **Forgot password** if needed. Read any account-status message shown by the site. |
| A staff page is unavailable | Confirm that you signed in with your staff account and that your role includes access. Ask an administrator to review your permissions. |
| A submission is not visible publicly | Check whether it is still a draft or awaiting moderator review. |
| A place or event is missing | Search with a shorter phrase and check the relevant category. Only active or published content may appear publicly. |
| A page or list fails to load | Refresh the page and retry. If the problem continues, note the page and time and contact the system administrator. |
| Browser notifications do not appear | Check browser/site notification permission and whether the deployment has push enabled. Use the in-app inbox in the meantime. |
| Analytics show no recent data | Check your analytics consent and contact an administrator if the reporting period or data setup is unclear. |
| A save or upload fails | Check your connection, file requirements, and account access, then retry. Do not repeatedly submit if the page shows that a save already succeeded. |

## Help and legal information

Use the site's **Help & Support** area or **Contact** page for assistance.
The public Contact page is `/info/contact`. Legal information is available at
`/info/legal/privacy-policy`, `/info/legal/terms-and-conditions`,
`/info/legal/accessibility`, and `/info/legal/cookie-policy`. For account
recovery, use `/info/account-recovery` only when the page says your account is
eligible for recovery.

## Important notes

- Public pages show information available from the current deployment; they
  are not a guarantee of real-time availability, safety, hours, prices, or
  event status.
- Optional features such as push delivery, analytics, rewards, or some
  account-management workflows may depend on server configuration.
- Follow applicable community rules and local laws. Report urgent safety
  concerns to the appropriate local authorities; the website is not an
  emergency-response service.
- This guide describes the main implemented user areas. Exact controls can
  vary by role, account status, browser, and deployment.
