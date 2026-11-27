# Connect Daet Responsive Layout Audit

Status: **read-only audit; no implementation changes approved**

## Root and global shell

| Area | File | Lines | Problem | Proposed fix |
|---|---|---|---|---|
| Root layout | `src/app/layout.js` | 14 | No `export const viewport` or `Viewport` export. Next.js can apply a default viewport, but the app does not declare scale, width, or theme metadata explicitly. | Add a root `viewport` export with `width: 'device-width'`, `initialScale: 1`, and only verified theme/viewport settings. |
| Global overflow | `src/app/globals.css` | 370 | At mobile widths it applies `min-width: 0` and `overflow-x: clip`, while later rules also reset body at 640px. | Keep one mobile overflow guard and remove duplicate reset rules; use page-level `overflow-x-clip` plus a table wrapper. |
| Touch targets | `src/app/globals.css` | 2982-2999 | Global mobile CSS changes touch behavior but does not enforce a 44px minimum for links/buttons. | Add a mobile-only min-height/min-width of 44px for interactive controls without reducing desktop density. |
| Text zoom | `src/app/globals.css` | 3007-3012 | Hard-coded 425px text adjustment block and 640px body reset are extra breakpoints. | Replace with Tailwind standard `sm/md/lg`; keep only the iOS form font-size rule. |
| FullCalendar | `src/app/globals.css` | 3034-3050 | FullCalendar toolbar switches to column at 767px, but is custom CSS rather than local page utilities. | Preserve custom CSS only for FullCalendar internals; align it to `max-width: 767px` with Tailwind's md value or move toolbar markup to utilities. |
| Container mismatch | many root pages | varied | Pages mix `max-w-2xl`, `max-w-3xl`, `max-w-7xl`, custom 1080px, and direct full-width shells. | Standardize major shells to `w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`, while keeping intentionally narrow auth/detail forms. |
| Height mismatch | layouts and pages | varied | `min-h-screen` is used broadly and remains in user/auth/admin shells. | Convert shell/page viewport heights to `min-h-dvh` where applicable. Preserve `100dvh` only for mobile conversation/editor chrome. |

## Visitor area

| Area | File | Lines | Problem | Proposed fix |
|---|---|---|---|---|
| Visitor layout | `src/app/(subsystems)/info/visitor/layout.js` | 12-16 | Home and non-home shells use `min-h-screen` and special home wrappers. | Use `min-h-dvh`; keep home-only wrapper if it supplies visual behavior, not layout branching. |
| Visitor desktop/mobile nav split | `src/app/(subsystems)/info/visitor/VisitorDesktopNavigation.js`, `VisitorMobileHeader.js` | 16, 15 | Two navigation shells render opposite visibility at `lg`. Desktop sidebar and mobile bottom nav are structurally different. | **Legitimately different** if desktop requires a vertical 286px sidebar and mobile requires a 5-tab bottom bar. They should share `navigation.js` items and active-route logic. |
| Duplicate visitor nav config | `src/app/(subsystems)/info/components/visitor/VisitorNavbar.js` | 23-30 | Top visitor navbar has its own `NAV_ITEMS`, duplicating `navigation.js` item labels/routes. | Extract one shared visitor nav config with desktop/mobile variants and map same routes. |
| Visitor navbar desktop/mobile markup | `VisitorNavbar.js` | 78-178 | Center desktop nav, login button, and mobile hamburger/menu are separate hidden/shown branches. | Keep top brand/actions in one shell; CSS-hide desktop nav and hamburger appropriately. Merge menu markup if visual structure permits. |
| Visitor detail fixed mobile shell | `src/app/(subsystems)/info/visitor/tourist-spots/[id]/page.js` | 441, 606 | Detail uses desktop class at 441 and a fixed bottom action bar at 606 with `md:hidden`; duplicated mobile/desktop action presentation. | Convert to one content stack and one breakpoint-responsive action row, retaining fixed mobile bottom controls only if needed. |
| Visitor tourist directory | `tourist-spots/page.js` | 282, 287, 330, 357, 413 | Separate mobile header and desktop header, with `lg:hidden`/`lg:flex`, plus mobile filter accordion and fixed category hero. | Merge common filter/search state into one responsive toolbar; use `lg:flex`, `lg:hidden` only for true presentation variants. |
| Visitor events | `visitor/events/page.js` | 180, 222, 251, 313 | Same mobile/desktop header split and separate filter/hero markup patterns as tourist spots. | Share a responsive directory header/filter pattern from existing components or a small local shared helper. |
| Visitor inline fixed backgrounds | `visitor/page.js` | 322, 360 | Inline background-image styles are acceptable for dynamic URLs, but duplicated fixed section sizing may still diverge. | Keep dynamic inline URLs, replace fixed viewport-oriented dimensions with responsive Tailwind aspect/height classes where possible. |
| Visitor scroll effects | `VisitorScrollEffects.module.css` | 15-20 | Reduced-motion implementation is custom and valid, but viewport-independent card reveal behavior should be audited separately. | Keep custom module only for reveal/reduced-motion behavior; do not add layout media rules. |
| Visitor custom breakpoint | `globals.css` | 7959, 7973, 9508, 9514 | Tourist detail uses 900px and 640px cutoffs, not Tailwind breakpoints. | Align content columns to `md`/`lg` (768/1024) and remove 900/640 only when it does not alter required density. |
| Visitor tourist/mobile shell CSS | `globals.css` | 7357-7359, 8060-8103 | Dedicated mobile shell is toggled with 1023px/640px/641px. | Map desktop/mobile shell to `lg:hidden` and `lg:block`; audit actual content parity first. |

## Auth area

| Area | File | Lines | Problem | Proposed fix |
|---|---|---|---|---|
| Auth pages | `src/app/(subsystems)/info/(auth)/login/page.js`, `register/page.js`, `forgot-password/page.js`, `reset-password/page.js`, `account-recovery/page.js` | 192, 162, 53, 211, varied | Auth screens mix full-width mobile surfaces with split desktop panels and custom auth.css. | Use one responsive grid: mobile single column, `lg:grid-cols-[...]` split desktop. Share auth shell/container. |
| Auth CSS | `src/app/(subsystems)/info/(auth)/auth.css` | 1-100 | Mostly design tokens and dark-mode overrides, but no viewport layout rules. | Keep for theme overrides only; move layout/size rules to Tailwind. |
| Auth fixed viewport | login/register | 192/162 | `min-h-screen` does not account for dynamic mobile browser chrome consistently. | Replace with `min-h-dvh`. |
| Auth breakpoint mismatch | login/register | split desktop markup/`xl:`-style sizing | Desktop split is activated through nested classes rather than one shared breakpoint audit. | Use Tailwind `lg` consistently; avoid mixed `md`, `lg`, `xl` unless content genuinely needs a separate scale. |

## User area

| Area | File | Lines | Problem | Proposed fix |
|---|---|---|---|---|
| User shell | `src/app/(subsystems)/info/user/layout.js` | 14-21 | Bottom padding and left sidebar offset are applied through Tailwind breakpoint classes, but JS determines conversation/announcement detail modes. | Keep route-state exemptions only; make navigation and shell responsive with CSS. Replace `min-h-screen` with `min-h-dvh`. |
| User JS viewport switch | `src/app/(subsystems)/info/components/user/MobileNav.js` | 119-124, 130-137, 145-197, 206-207, 391 | Uses `matchMedia('(min-width: 1024px)')` and `(max-width: 1023px)` to open drawer, lock scroll, toggle data attributes, and restore navigation. | Replace layout/drawer behavior with CSS breakpoint classes plus a non-viewport state for the open drawer. Do not use viewport state to decide content rendering. |
| User desktop/mobile navigation | `MobileNav.js`, `UserTopHeader.js` | 424-445, 504-506, 881-917 | Separate bottom nav, desktop sidebar/drawer, and mobile/desktop headers are legitimately different shell structures. | **Legitimately different** because desktop and mobile navigation have different structure. Drive both from one shared nav config and CSS; keep the mobile drawer for compact overlay. |
| Duplicate user nav list | `MobileNav.js` | 42-50, 462, 550 | One `navItems` config feeds bottom nav and drawer, but duplicate visible markup remains. | Extend one nav config to desktop/drawer/bottom variants and keep label rendering centralized. |
| Desktop-only header props | `UserTopHeader.js` | 105-119, 504, 881 | `desktopOnly`, `mobileOnly`, `showMobileHeader`, and `detailMode` create many layout variants. | Reduce props to structural variants: standard, detail, standalone; control visibility with breakpoint classes. |
| Mobile header heights | `UserTopHeader.js` | 883, 918 | Fixed 90px home header and 64px detail header plus spacer logic create route-dependent heights. | Use shared `h-16` plus optional 90px home layout as a breakpoint-safe content region rather than fixed spacer data. |
| User custom CSS | `src/app/(subsystems)/info/user/user-sections.css` | 33, 159, 788, 840, 902, 1102, 1141, 1896, 2172, 2616, 3016, 3868, 3874, 4513, 5239, 5490, 6680 | Many viewport rules use 1023, 639, 480, 420, and 900 instead of Tailwind 640/768/1024. | Normalize layout rules to 640/768/1024 while retaining local internals for FullCalendar or non-layout visual effects. |
| User dashboard overlap rules | `globals.css` | 1098-1100, 2242-2245, 2262-2265, 2312-2315, 2353-2355, 2453-2454 | Special dashboard media rules selectively hide suggestions/feedback and fix header position. | Merge into a single mobile dashboard layout with CSS grid/flex; do not preserve separate state-derived visibility where actions are content. |
| User conversation viewport JS | `src/app/(subsystems)/info/user/messaging/[id]/page.js` | 81, 966 | Uses JS viewport height state for the conversation. | Convert shell to `h-dvh`; use visualViewport only for keyboard-positioning, not layout branch switching. |
| User rich text/editor | `RichTextEditor.js` | 154-220, 495-507 | visualViewport is used for toolbar and keyboard-offset positioning, appropriate for mobile chrome. | Keep visualViewport for popover/keyboard placement only; no desktop layout branch. |
| User fixed/reported heights | `user-sections.css`, dashboard, list pages | varied | Fixed heights and custom `100vh` coexist with `min-h-screen`. | Replace global shell heights with `min-h-dvh`; use `h-dvh` only for explicit full-height conversation/editor UIs. |

## Admin area

| Area | File | Lines | Problem | Proposed fix |
|---|---|---|---|---|
| Admin JS viewport switch | `src/app/(subsystems)/info/components/AdminSidebar.js` | 421-427 | `window.innerWidth >= 1024` sets sidebar CSS variable on resize. | Replace the variable width logic with CSS breakpoints plus a variable only for the sidebar state; mobile sidebar width is already fixed in markup. |
| Admin shell inline offset | `src/app/(subsystems)/info/components/admin/AdminShell.js` | 88 | Applies `marginLeft: var(--admin-sidebar-width)` inline. | Remove inline offset and use CSS grid/flex shell: mobile full width; `lg:ml-72` or shared grid column. |
| Other admin inline offsets | numerous admin pages | examples 616, 1283, 238, 303, 179, 921, 209, 611, 464 | Pages repeat `marginLeft: var(--admin-sidebar-width)`, creating inconsistent shells. | Centralize all authenticated admin page offsets in `AdminShell`; remove route-level inline margins. |
| Admin sidebar/toggle | `AdminSidebar.js` | 431 onward | Separate mobile hamburger/drawer and desktop fixed sidebar are legitimately different structures. | **Legitimately different**. Keep separate visual shells, but share one nav config and active-path logic. |
| Admin nav config | `AdminSidebar.js` | inspect nav arrays | Sidebar likely duplicates grouped role-navigation data across role branches. | Extract shared role-filtered nav config and use one active matcher. |
| Admin shell | `globals.css` | 3670-3712, 3748-3750 | Custom desktop/mobile padding and header direction use 768/1024. | Map to Tailwind `md:` and `lg:` utilities where possible. |
| Admin form controls | `globals.css` | 3827-3834 | Mobile sets 16px fonts to avoid iOS zoom, while desktop controls remain 36px min-height. | Keep 16px font and set 44px min-height on mobile; desktop can remain compact. |
| Admin stat grids | `globals.css` | 3962-3995 | Custom CSS repeats 640/1024 grid counts. | Replace with `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` and data variants only if needed. |
| Admin pagination | `globals.css` | 4492-4495 | 480px pagination center breakpoint differs from Tailwind. | Move to `sm`/`md` responsive flex; keep only if 480-specific content wrapping is observed. |
| Admin calendar | `AdminCalendar.css` | 143-148 | 639px cutoff does not match Tailwind sm (640px). | Change to 640px or Tailwind/markup responsive handling. |
| Admin page table overflow | many admin pages | list/table markup | Tables and wide analytics charts can overflow fixed page shells. | Wrap tables in `overflow-x-auto`, use `min-w-[...]` only inside wrapper, and verify 360px. |
| Admin inline height/max-height | tourism dashboard, tourism users/events | 890, 1361 | Fixed `90vh`, dynamic chart heights, and inline widths are data visualization not layout branch. | Preserve dynamic chart dimensions; use `max-h-dvh` or responsive height utilities for containers. |

## Inline, duplicated, and non-Tailwind breakpoint findings

| Area | File | Problem | Proposed fix |
|---|---|---|---|
| Fixed screen heights | `globals.css`, user sections, admin, auth | `h-screen`, `100vh`, and `min-h-screen` are mixed. | Use `min-h-dvh` or `h-dvh` only for intentional full-height UI. |
| Fixed 286/302px desktop chrome | `VisitorDesktopNavigation.js`, `UserLayout`, `AdminShell` | Fixed desktop widths are legitimate sidebars but should align in variables/classes. | Keep fixed sidebars at `lg`; use shared variable/class and verify at 1024. |
| Custom media breakpoints | `globals.css`, `user-sections.css`, AdminCalendar.css | 370, 420, 480, 639, 640, 700, 900, 1023px values do not match Tailwind defaults 640/768/1024. | Migrate layout rules to 640/768/1024; keep 480/900 only for measured third-party/component internals. |
| Inline breakpoint-free style blocks | admin/events, admin/announcement, admin/moderation, print blog | Some `<style jsx global>` blocks include layout/media rules. | Audit and move printable/shared layout rules to CSS modules or Tailwind; keep page-specific third-party overrides. |
| Duplicate top visitor navigation | `VisitorNavbar.js` vs `navigation.js`/`VisitorDesktopNavigation.js` | Separate route configs can drift. | Create one shared visitor config and let shell components consume it. |
| Missing Tailwind config | project | No custom Tailwind breakpoint config was found in the requested audit surface. | Tailwind defaults remain 640/768/1024/1280/1536; no breakpoint config mismatch found. |

## Recommended first implementation areas

1. Root viewport export and shell min-height/container normalization.
2. Visitor top/navbar config consolidation and shared nav list.
3. User shell/drawer: remove matchMedia layout decisions and preserve only drawer open-state behavior.
4. Admin shell: remove resize/inline-offset layout logic and use one CSS grid/flex shell.
5. Replace custom 639/700/900/1023 layout cutoffs with Tailwind 640/768/1024 where the markup is not third-party-specific.
