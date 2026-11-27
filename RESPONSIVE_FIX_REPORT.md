# Connect Daet Responsive Fix Report

## What diverged

- The root layout had no explicit Next.js `viewport` export.
- Visitor navigation used separate desktop/mobile route lists:
  `VisitorDesktopNavigation.js`, `VisitorMobileHeader.js`, and
  `VisitorNavbar.js` had different or duplicated link definitions.
- User navigation initialized an open desktop drawer from `matchMedia`,
  synchronized it with viewport changes, and used a separate mobile drawer
  and fixed desktop sidebar.
- Visitor and user shells used `min-h-screen` in many shell/page locations.
- Mobile navigation controls included several 40px targets, below the 44px
  mobile target size.

## What was merged or converted

### Root shell

- Added an explicit root `viewport` export with `width: device-width`,
  `initialScale: 1`, and `resizes-visual`.
- Converted visitor and user layout shells from `min-h-screen` to `min-h-dvh`.

### Visitor area

- Consolidated visitor route, label, icon, and match metadata in
  `src/app/(subsystems)/info/visitor/navigation.js`.
- Updated `VisitorNavbar`, `VisitorDesktopNavigation`, and
  `VisitorMobileHeader` consumers to use shared navigation data.
- Increased visitor navbar and tourist-directory mobile controls to at least
  44px where changed.
- Kept desktop sidebar and mobile bottom nav as structurally legitimate
  variants because their layouts are structurally different.

### User area

- Removed viewport-driven desktop-drawer initialization and the viewport
  collapse dataset synchronization.
- Replaced the desktop/mobile drawer split assumptions with a CSS-visible
  `lg` desktop sidebar and a `lg:hidden` mobile drawer.
- Added desktop collapsed-state CSS instead of measuring the viewport in
  JavaScript.
- Added a 302px desktop sidebar class consistent with the user shell offset.
- Increased changed mobile header/drawer controls to 44px.

## Files changed

- `src/app/layout.js`
- `src/app/(subsystems)/info/visitor/layout.js`
- `src/app/(subsystems)/info/user/layout.js`
- `src/app/(subsystems)/info/visitor/navigation.js`
- `src/app/(subsystems)/info/visitor/VisitorDesktopNavigation.js`
- `src/app/(subsystems)/info/components/visitor/VisitorNavbar.js`
- `src/app/(subsystems)/info/visitor/tourist-spots/page.js`
- `src/app/(subsystems)/info/components/user/MobileNav.js`
- `src/app/(subsystems)/info/components/user/UserTopHeader.js`
- `src/app/(subsystems)/info/user/user-sections.css`

Commits:

- `28f0a27 fix: normalize responsive app shells`
- `c7b7c12 fix: unify visitor navigation responsiveness`
- `a6bdf16 fix: simplify user navigation responsiveness`

## Browser verification

The production build was checked with Chromium at 360, 390, 768, 1024, and
1440px.

| Width | Visitor home | Tourist-spots directory | Login | Result |
|---|---|---|---|---|
| 360px | 345px document client, 345px scroll width | 345px document client, 345px scroll width | 360px document client, 360px scroll width | No document-level horizontal overflow |
| 390px | 375px document client, 375px scroll width | 375px document client, 375px scroll width | 390px document client, 390px scroll width | No document-level horizontal overflow |
| 768px | 753px document client, 753px scroll width | 753px document client, 753px scroll width | 768px document client, 768px scroll width | No document-level horizontal overflow |
| 1024px | 1009px document client, 1009px scroll width | 1009px document client, 1009px scroll width | 1024px document client, 1024px scroll width | No document-level horizontal overflow |
| 1440px | 1425px document client, 1425px scroll width | 1425px document client, 1425px scroll width | 1440px document client, 1440px scroll width | No document-level horizontal overflow |

Tourist-directory navigation measured separately:

- 768px: mobile menu visible; desktop center nav hidden.
- 1024px: mobile menu hidden; desktop center nav visible.
- 1440px: mobile menu hidden; desktop center nav visible.

No page-level overlap or horizontal overflow was observed in the sampled
visitor and login views. Layout flash was not conclusively measured; no reload
flash was apparent in repeated browser navigation, but this report does not claim
a paint-level flash test.

The authenticated `/info/user/dashboard` route was checked unauthenticated at
390px and redirected to `/info/login?message=Please+sign+in+to+continue`.
Authenticated user-side dashboard/navigation views were not checked because no
test credentials or auth session were available.

## Validation

- `npm.cmd test`: pass, 278 tests, 0 failures.
- `npm.cmd run lint`: pass, 0 errors, 150 warnings. No lint error increase.
- `npm.cmd run build`: pass, 133 static pages generated.
- `git diff --check`: pass.

## What remains

- Authenticated user dashboard, profile, messaging, editor, settings, and
  notification layouts were not visually checked with a live session.
- Authenticated admin/moderator screens remain outside the approved scope.
- Custom 639/700/900/1023px rules in global/user CSS remain for later targeted
  cleanup; only the audited user/visitor shell behavior was changed.
- Realtime or database-backed content availability was not used to determine
  layout correctness.
