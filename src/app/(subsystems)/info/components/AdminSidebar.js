'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Menu, X } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'
import sidebarBackground from '@/app/(subsystems)/info/assets/images/rename_sidebar.png'
import { Icon } from './Icon'
import ConfirmationModal from './ConfirmationModal'
import { STAFF_ROLES, canAccessAdminPage, getStaffHomePath, getStaffRoleLabel, hasPermission, normalizeStaffRole } from '@/lib/staffRoles.mjs'

const adminNavigationSections = [
  {
    id: 'overview',
    label: 'Overview',
    modules: [
      { id: 'dashboard', label: 'Dashboard', iconName: 'dashboard', href: '/info/admin/dashboard' },
    ],
  },
  {
    id: 'accounts',
    label: 'Accounts & Access',
    modules: [
      { id: 'users', label: 'Staff & Tourist Accounts', iconName: 'users', href: '/info/admin/users' },
    ],
  },
  {
    id: 'public-information',
    label: 'Public Information',
    modules: [
      { id: 'faqs', label: 'Frequently Asked Questions', iconName: 'feedback', href: '/info/admin/faqs' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Oversight',
    modules: [
      { id: 'analytics-dashboard', label: 'Analytics & Exports', iconName: 'analytics', href: '/info/admin/analytics' },
      { id: 'activity-logs', label: 'Audit & Activity Logs', iconName: 'analytics', href: '/info/admin/activity-logs' },
    ],
  },
  {
    id: 'system',
    label: 'System Administration',
    modules: [
      {
        id: 'settings',
        label: 'System Settings',
        iconName: 'settings',
        items: [
          { href: '/info/admin/settings/general', label: 'General Site Info', iconName: 'settings', exact: true },
          { href: '/info/admin/settings/appearance', label: 'Branding & Appearance', iconName: 'image', exact: true },
          { href: '/info/admin/settings/categories', label: 'Alert & Place Categories', iconName: 'content', exact: true },
          { href: '/info/admin/announcement-settings', label: 'Notification Settings', iconName: 'notifications', exact: true },
          { href: '/info/admin/settings/security', label: 'Security Policy', iconName: 'lock', exact: true },
          { href: '/info/admin/settings/login-security', label: 'Failed Sign-ins', iconName: 'lock', exact: true },
          { href: '/info/admin/settings/email', label: 'Email Delivery', iconName: 'notifications', exact: true },
        ],
      },
      { id: 'notifications-inbox', label: 'Notification Inbox', iconName: 'notifications', badgeKey: 'unreadNotifications', href: '/info/admin/notifications/inbox' },
      { id: 'staff-chat', label: 'Staff Chat', iconName: 'forum', href: '/info/admin/staff-chat' },
      { id: 'data', label: 'Backup & Restore', iconName: 'data', href: '/info/admin/data/backups' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    modules: [
      { id: 'my-account', label: 'My Account', iconName: 'profile', href: '/info/admin/account' },
    ],
  },
]

const staffNavigationSections = [
  {
    id: 'main',
    label: 'Main',
    modules: [
      { id: 'dashboard', label: 'Dashboard', iconName: 'dashboard', href: '/info/admin/dashboard' },
    ],
  },
  {
    id: 'alerts',
    label: 'Real-time Alerts',
    modules: [
      { id: 'alerts', label: 'Alert Broadcasts', iconName: 'warning', href: '/info/admin/alerts' },
    ],
  },
  {
    id: 'tourism',
    label: 'Tourism Management',
    modules: [
      {
        id: 'blogs',
        label: 'Blog',
        iconName: 'blog',
        badgeKey: 'pendingApprovals',
        href: '/info/admin/blogs?status=all',
      },
      {
        id: 'tourist-spots',
        label: 'Places Directory',
        iconName: 'attractions',
        href: '/info/admin/tourist-spots',
      },
      {
        id: 'events',
        label: 'Events',
        iconName: 'events',
        items: [
          { href: '/info/admin/events', label: 'All Events', iconName: 'events', exact: true },
          { href: '/info/admin/event-approvals', label: 'Event Approvals', iconName: 'moderation' },
        ],
      },
      {
        id: 'announcements',
        label: 'Announcements',
        iconName: 'notifications',
        href: '/info/admin/announcement',
      },
      {
        id: 'forum',
        label: 'Forum',
        iconName: 'forum',
        href: '/info/admin/forum',
      },
      {
        id: 'feedback',
        label: 'Feedback',
        iconName: 'feedback',
        href: '/info/admin/feedback',
      },
      {
        id: 'faqs',
        label: 'Frequently Asked Questions',
        iconName: 'feedback',
        href: '/info/admin/faqs',
      },
      {
        id: 'reviews',
        label: 'Reviews',
        iconName: 'feedback',
        href: '/info/admin/reviews',
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    modules: [
      { id: 'users', label: 'Users', iconName: 'users', href: '/info/admin/users' },
      { id: 'activity-logs', label: 'Activity Logs', iconName: 'analytics', href: '/info/admin/activity-logs' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    modules: [
      { id: 'staff-chat', label: 'Staff Chat', iconName: 'forum', href: '/info/admin/staff-chat' },
    ],
  },
  {
    id: 'moderation',
    label: 'Moderation',
    modules: [
      { id: 'reported-content', label: 'Reported Content', iconName: 'moderation', href: '/info/admin/moderation', exact: true },
      { id: 'moderation-notifications', label: 'Post Notifications', iconName: 'notifications', badgeKey: 'unreadNotifications', href: '/info/admin/moderation/notifications' },
      { id: 'community-guidelines', label: 'Community Guidelines', iconName: 'content', href: '/info/admin/community-guidelines' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    modules: [
      { id: 'analytics-dashboard', label: 'Analytics Dashboard', iconName: 'analytics', href: '/info/admin/analytics' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    modules: [
      {
        id: 'notifications',
        label: 'Notifications',
        iconName: 'notifications',
        items: [
          { href: '/info/admin/notifications/inbox', label: 'Inbox', iconName: 'notifications', exact: true },
          { href: '/info/admin/notifications/send', label: 'Send Announcement', iconName: 'notifications' },
        ],
      },
      { id: 'media-library', label: 'Media Library', iconName: 'image', href: '/info/admin/file-management' },
      { id: 'data', label: 'Data', iconName: 'data', href: '/info/admin/data' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    modules: [
      {
        id: 'settings',
        label: 'Settings',
        iconName: 'settings',
        items: [
          { href: '/info/admin/settings/general', label: 'General', iconName: 'settings', exact: true },
          { href: '/info/admin/settings/categories', label: 'Categories', iconName: 'content', exact: true },
          { href: '/info/admin/settings/email', label: 'Email', iconName: 'notifications', exact: true },
          { href: '/info/admin/settings/security', label: 'Security', iconName: 'lock', exact: true },
          { href: '/info/admin/settings/maintenance', label: 'Maintenance Mode', iconName: 'warning', exact: true },
          { href: '/info/admin/settings/appearance', label: 'Appearance', iconName: 'image', exact: true },
          { href: '/info/admin/settings/rewards', label: 'Rewards & Points', iconName: 'analytics', exact: true },
        ],
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    modules: [
      {
        id: 'my-account',
        label: 'My Account',
        iconName: 'profile',
        href: '/info/admin/account',
      },
    ],
  },
]

export default function AdminSidebar(props) {
  return (
    <Suspense fallback={<div className="admin-sidebar-drawer fixed inset-y-0 left-0 z-30 w-72 bg-slate-950" aria-hidden="true" />}>
      <AdminSidebarContent {...props} />
    </Suspense>
  )
}

function AdminSidebarContent({ user, roleLabel: pageRoleLabel = 'System Administrator', onLogout, userRole: userRoleProp }) {
  // Menus are filtered with the same rules the proxy enforces, so a staff
  // member never sees a link that would redirect them away.
  const userRole = normalizeStaffRole(userRoleProp || user?.role || user?.user_type || '')
  const roleLabel = userRole === STAFF_ROLES.ADMIN ? pageRoleLabel : getStaffRoleLabel(userRole)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const navRef = useRef(null)
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      [...adminNavigationSections, ...staffNavigationSections].flatMap((section) =>
        section.modules.filter((module) => module.items).map((module) => [module.id, false])
      )
    )
  )
  const [pendingApprovals, setPendingApprovals] = useState(null)
  const [permissionOverrides, setPermissionOverrides] = useState(null)

  // Per-person permission overrides live in the signed session; read them so
  // the menu matches what the proxy will actually allow.
  useEffect(() => {
    if (!userRole || userRole === STAFF_ROLES.ADMIN) return undefined
    let active = true
    fetch('/info/api/admin/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (active && result?.success) setPermissionOverrides(result.overrides) })
      .catch(() => {})
    return () => { active = false }
  }, [userRole])
  const [unreadNotifications, setUnreadNotifications] = useState(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined

    const storageKey = 'connect-daet-admin-sidebar-scroll'
    try {
      const savedScrollTop = Number(window.sessionStorage.getItem(storageKey))
      if (Number.isFinite(savedScrollTop)) nav.scrollTop = savedScrollTop
    } catch (error) {
      console.warn('Unable to restore admin sidebar scroll position:', error)
    }

    const saveScrollPosition = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(nav.scrollTop))
      } catch (error) {
        console.warn('Unable to save admin sidebar scroll position:', error)
      }
    }

    nav.addEventListener('scroll', saveScrollPosition, { passive: true })
    return () => {
      saveScrollPosition()
      nav.removeEventListener('scroll', saveScrollPosition)
    }
  }, [])

  const staffHomePath = getStaffHomePath(userRole)
  const navigationSections = userRole === STAFF_ROLES.ADMIN
    ? adminNavigationSections
    : staffNavigationSections
  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      modules: section.modules
        .map((module) => ({
          ...module,
          href: module.id === 'dashboard' ? staffHomePath : module.href,
        }))
        .filter((module) => module.items || canAccessAdminPage(userRole, module.href, permissionOverrides))
        .map((module) => ({
          ...module,
          items: module.items?.filter((item) => canAccessAdminPage(userRole, item.href, permissionOverrides)),
        }))
        .filter((module) => !module.items || module.items.length > 0),
    }))
    .filter((section) => section.modules.length > 0)

  const normalizeHref = (href) => href.split('?')[0]
  const isActive = (href) => normalizeHref(pathname) === normalizeHref(href) || normalizeHref(pathname).startsWith(`${normalizeHref(href)}/`)
  const isItemActive = (item) => {
    const itemPath = normalizeHref(item.href)
    if (item.exact && pathname !== itemPath) return false
    if (!item.exact && !isActive(item.href)) return false

    const expectedParams = new URLSearchParams(item.href.split('?')[1] || '')
    for (const [key, value] of expectedParams) {
      const actualValue = searchParams.get(key)
      if (actualValue !== value && !(actualValue === null && item.defaultParams?.[key] === value)) return false
    }
    const expectedPresentParams = [...expectedParams].filter(([key, value]) => (
      !(searchParams.get(key) === null && item.defaultParams?.[key] === value)
    )).length
    if (item.exact && searchParams.size !== expectedPresentParams) return false
    return true
  }
  const isModuleActive = (module) => module.items
    ? module.items.some(isItemActive)
    : module.exact
      ? normalizeHref(pathname) === normalizeHref(module.href)
      : isActive(module.href)

  useEffect(() => {
    if (!hasPermission(userRole, 'moderation.manage')) return undefined

    let active = true
    fetch('/info/api/admin/blogs?status=all&pageSize=1', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load pending blog approvals.')
        }
        if (active) setPendingApprovals(Number(result.stats?.pendingApprovals) || 0)
      })
      .catch((error) => {
        console.error('Unable to load the pending approval sidebar badge:', error)
      })

    return () => {
      active = false
    }
  }, [userRole])

  useEffect(() => {
    if (!hasPermission(userRole, 'moderation.manage')) return undefined

    let active = true
    const loadUnreadNotifications = async () => {
      try {
        const response = await fetch('/info/api/notifications?count_only=true&scope=staff', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load staff notifications.')
        }
        if (active) setUnreadNotifications(Number(result.unread_count) || 0)
      } catch (error) {
        console.error('Unable to load the staff notification badge:', error)
      }
    }

    void loadUnreadNotifications()
    const intervalId = window.setInterval(loadUnreadNotifications, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [userRole])

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true)
  }

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false)
    if (onLogout) {
      await onLogout()
      return
    }
    // Centralized logout: clears the signed HTTP-only server cookie via
    // /info/api/logout, the display-only client cookie, storage, and Supabase.
    await performLogout()
    router.push('/info/login')
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-72'
  const userName = user?.full_name || user?.user_name || 'Daet Tourism Admin'
  const initials = userName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('') || 'A'

  useEffect(() => {
    const applyWidth = () => {
      const isDesktop = window.innerWidth >= 1024
      document.documentElement.style.setProperty(
        '--admin-sidebar-width',
        isDesktop ? (isCollapsed ? '5rem' : '18rem') : '0rem'
      )
    }
    applyWidth()
    window.addEventListener('resize', applyWidth)
    return () => window.removeEventListener('resize', applyWidth)
  }, [isCollapsed])

  return (
    <>
      {/* Mobile hamburger toggle (hidden on desktop) */}
      <button
        type="button"
        onClick={() => { setIsCollapsed(false); setMobileOpen(true) }}
        className={`fixed left-4 top-4 z-40 h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-md lg:hidden ${mobileOpen ? 'hidden' : 'flex'}`}
        aria-expanded={mobileOpen}
        aria-controls="admin-navigation-drawer"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div id="admin-navigation-drawer" className={`admin-sidebar-drawer admin-sidebar-branded fixed left-0 top-0 z-30 flex h-dvh min-h-0 ${sidebarWidth} max-lg:w-[min(22rem,calc(100vw-1rem))] max-lg:max-w-[calc(100vw-1rem)] flex-col border-r transition-all duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="admin-sidebar-scenic" aria-hidden="true">
          <Image
            src={sidebarBackground}
            alt=""
            fill
            sizes={isCollapsed ? '5rem' : '(max-width: 1023px) 95vw, 18rem'}
            quality={75}
            className="admin-sidebar-scenic-image"
          />
          <div className="admin-sidebar-scenic-overlay" />
        </div>

        {/* Brand */}
        <div className={`admin-sidebar-brand border-b px-4 py-4 ${isCollapsed ? 'is-collapsed' : ''}`}>
          <div className={`admin-sidebar-brand-head ${isCollapsed ? 'is-collapsed' : ''}`}>
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(!isCollapsed)
                if (mobileOpen) setMobileOpen(false)
              }}
              className="admin-sidebar-brand-lockup"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              aria-controls="admin-navigation-drawer"
            >
              <div className={`admin-sidebar-brand-mark-wrap ${isCollapsed ? 'is-collapsed' : ''}`}>
                <Image
                  src="/daet-brand.png"
                  alt="Connect Daet emblem"
                  width={220}
                  height={147}
                  sizes={isCollapsed ? '130px' : '170px'}
                  quality={75}
                  className="admin-sidebar-brand-mark"
                />
              </div>
              {!isCollapsed && (
                <>
                  <p className="admin-sidebar-brand-title">Connect Daet</p>
                  <p className="admin-sidebar-kicker">
                    {userRole === STAFF_ROLES.ADMIN ? 'Admin Console' : `${roleLabel} Console`}
                  </p>
                </>
              )}
            </button>
            <div className="admin-sidebar-brand-actions">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="admin-sidebar-icon-button flex-shrink-0 rounded-lg p-1.5 transition-all lg:hidden"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Signed-in administrator */}
          {!isCollapsed && (
            <div className="admin-sidebar-operator mt-4 flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5">
              <div className="admin-sidebar-avatar relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold uppercase">
                {user?.profile_image_url ? (
                  <Image
                    src={user.profile_image_url}
                    alt=""
                    fill
                    sizes="36px"
                    unoptimized
                    className="object-cover"
                  />
                ) : initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="admin-sidebar-name truncate text-xs font-bold">{userName}</p>
                <p className="admin-sidebar-role truncate text-[10px] font-medium uppercase tracking-[0.1em]" title={roleLabel}>{roleLabel}</p>
              </div>
              <span className="admin-sidebar-online h-2.5 w-2.5 flex-shrink-0 rounded-full" title="Online" aria-label="Online" />
            </div>
          )}
        </div>

      <nav ref={navRef} className="admin-sidebar-nav min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3" aria-label="Admin navigation">
        {filteredSections.map((section, sectionIndex) => (
          <section key={section.id} className={`admin-nav-section-group admin-nav-section-${section.id}`}>
            {!isCollapsed && (
              <p className={`admin-nav-section ${sectionIndex === 0 ? 'mt-1' : 'mt-4'}`}>{section.label}</p>
            )}
            {section.modules.map((module) => {
              const active = isModuleActive(module)
              const expanded = Boolean(openGroups[module.id] || active && module.items)
              const badge = module.badgeKey === 'pendingApprovals'
                ? pendingApprovals
                : module.badgeKey === 'unreadNotifications'
                  ? unreadNotifications
                  : module.badge

              return (
                <div key={module.id} className={`admin-nav-entry ${module.items ? 'admin-nav-entry-group' : ''}`}>
                  {module.items ? (
                    <>
                      <button
                        type="button"
                        className="admin-nav-group"
                        data-active={active}
                        data-open={expanded}
                        title={isCollapsed ? module.label : undefined}
                        aria-label={isCollapsed ? `${module.label}${active ? ', current section' : ''}` : undefined}
                        aria-expanded={isCollapsed ? false : expanded}
                        aria-controls={`admin-nav-${module.id}`}
                        onClick={() => {
                          if (isCollapsed) {
                            setIsCollapsed(false)
                            setOpenGroups((current) => ({ ...current, [module.id]: true }))
                            return
                          }
                          setOpenGroups((current) => ({ ...current, [module.id]: !expanded }))
                        }}
                      >
                        <Icon name={module.iconName} className="h-[18px] w-[18px] flex-shrink-0" />
                        {!isCollapsed && <span className="min-w-0 flex-1 truncate text-left">{module.label}</span>}
                        {badge > 0 && <span className="admin-nav-badge" aria-label={`${badge} pending approvals`}>{badge}</span>}
                        {!isCollapsed && (
                          <ChevronDown className={`admin-nav-chevron h-4 w-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                        )}
                      </button>
                      {!isCollapsed && expanded && (
                        <div id={`admin-nav-${module.id}`} className="admin-nav-sub">
                          {module.items.map((item) => {
                            const itemActive = isItemActive(item)
                            const itemBadge = item.badgeKey === 'pendingApprovals' ? pendingApprovals : item.badge
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`admin-nav-item ${item.warning ? 'admin-nav-item-warning' : ''}`}
                                data-active={itemActive}
                                aria-current={itemActive ? 'page' : undefined}
                                title={isCollapsed ? item.label : undefined}
                              >
                                <Icon name={item.iconName} className={`h-4 w-4 flex-shrink-0 ${itemActive ? '' : 'opacity-60'}`} />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {itemBadge > 0 && (
                                  <span className="admin-nav-badge admin-nav-badge-pending">{itemBadge}</span>
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={module.href}
                      onClick={() => setMobileOpen(false)}
                      className={`admin-nav-item ${module.id === 'dashboard' ? 'admin-nav-dashboard' : ''}`}
                      data-active={active}
                      aria-current={active ? 'page' : undefined}
                      title={isCollapsed ? module.label : undefined}
                    >
                      <Icon name={module.iconName} className="h-[18px] w-[18px] flex-shrink-0" />
                      {!isCollapsed && <span className="flex-1 truncate">{module.label}</span>}
                      {badge > 0 && (
                        <span
                          className="admin-nav-badge admin-nav-badge-pending"
                          aria-label={module.badgeKey === 'unreadNotifications' ? `${badge} unread notifications` : `${badge} pending approvals`}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </nav>

      <div className="admin-sidebar-footer shrink-0 border-t p-3">
        <div className={`admin-sidebar-account flex items-center ${isCollapsed ? 'is-collapsed justify-center' : 'gap-2.5'}`}>
          <div
            className="admin-sidebar-avatar relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold uppercase"
            title={isCollapsed ? userName : undefined}
            role={isCollapsed ? 'img' : undefined}
            aria-label={isCollapsed ? userName : undefined}
            tabIndex={isCollapsed ? 0 : undefined}
          >
            {user?.profile_image_url ? (
              <Image
                src={user.profile_image_url}
                alt=""
                fill
                sizes="36px"
                unoptimized
                className="object-cover"
              />
            ) : initials}
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="admin-sidebar-name truncate text-xs font-semibold">{userName}</p>
              <p className="admin-sidebar-status flex items-center gap-1.5 text-[10px]">
                <span className="admin-sidebar-online h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                Online
              </p>
            </div>
          )}
          {isCollapsed && <span className="admin-sidebar-account-tooltip" aria-hidden="true">{userName}</span>}
        </div>
        <button
          type="button"
          onClick={handleLogoutClick}
          className={`admin-nav-logout mt-2 flex w-full items-center justify-center gap-3 rounded-lg py-2.5 text-sm font-semibold ${isCollapsed ? 'px-0' : 'px-3'}`}
          title={isCollapsed ? 'Logout' : undefined}
          aria-label="Logout"
        >
          <Icon name="logout" className="h-[18px] w-[18px] flex-shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </div>

    {/* Logout Confirmation Modal */}
    <ConfirmationModal
      isOpen={showLogoutConfirm}
      title="Confirm Logout"
      message="Are you sure you want to logout? Any unsaved work will be lost."
      confirmText="Logout"
      cancelText="Cancel"
      isDangerous={true}
      onConfirm={handleConfirmLogout}
      onCancel={() => setShowLogoutConfirm(false)}
    />
    </>
  )
}