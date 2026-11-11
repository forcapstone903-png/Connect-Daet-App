'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Menu, X } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'
import { Icon } from './Icon'
import ConfirmationModal from './ConfirmationModal'

const navigationSections = [
  {
    id: 'main',
    label: 'Main',
    modules: [
      { id: 'dashboard', label: 'Dashboard', iconName: 'dashboard', href: '/info/admin/dashboard', requiredRoles: ['admin'] },
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
        requiredRoles: ['admin'],
        href: '/info/admin/blogs?status=all',
      },
      {
        id: 'tourist-spots',
        label: 'Tourist Spots',
        iconName: 'attractions',
        requiredRoles: ['admin', 'content_manager'],
        href: '/info/admin/tourist-spots',
      },
      {
        id: 'events',
        label: 'Events',
        iconName: 'events',
        requiredRoles: ['admin', 'content_manager'],
        items: [
          { href: '/info/admin/events', label: 'All Events', iconName: 'events', exact: true },
          { href: '/info/admin/event-approvals', label: 'Event Approvals', iconName: 'moderation' },
        ],
      },
      {
        id: 'announcements',
        label: 'Announcements',
        iconName: 'notifications',
        requiredRoles: ['admin'],
        href: '/info/admin/announcement',
      },
      {
        id: 'forum',
        label: 'Forum',
        iconName: 'forum',
        requiredRoles: ['admin', 'moderator'],
        items: [
          { href: '/info/admin/forum', label: 'Topics', iconName: 'forum', exact: true },
          { href: '/info/admin/engagement', label: 'Engagement', iconName: 'analytics' },
          { href: '/info/admin/moderation', label: 'Reported Content', iconName: 'moderation' },
        ],
      },
      {
        id: 'feedback',
        label: 'Feedback',
        iconName: 'feedback',
        requiredRoles: ['admin', 'moderator'],
        href: '/info/admin/feedback',
      },
    ],
  },
  {
    id: 'people',
    label: 'People',
    modules: [
      { id: 'users', label: 'Users', iconName: 'users', href: '/info/admin/users', requiredRoles: ['admin', 'moderator'] },
      { id: 'people-engagement', label: 'User Engagement', iconName: 'analytics', href: '/info/admin/engagement', requiredRoles: ['admin', 'moderator'] },
      { id: 'activity-logs', label: 'Activity Logs', iconName: 'analytics', href: '/info/admin/activity-logs', requiredRoles: ['admin'] },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    modules: [
      { id: 'visitor-statistics', label: 'Visitor Statistics', iconName: 'analytics', href: '/info/admin/analytics/visitors', requiredRoles: ['admin', 'analyst'] },
      { id: 'popular-content', label: 'Popular Content', iconName: 'analytics', href: '/info/admin/analytics/content', requiredRoles: ['admin', 'analyst'] },
      { id: 'analytics-engagement', label: 'User Engagement', iconName: 'analytics', href: '/info/admin/analytics/engagement', requiredRoles: ['admin', 'analyst'] },
      { id: 'export-reports', label: 'Export Reports', iconName: 'data', href: '/info/admin/analytics/reports', requiredRoles: ['admin', 'analyst'] },
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
        requiredRoles: ['admin'],
        items: [
          { href: '/info/admin/notifications/send', label: 'Send Announcement', iconName: 'notifications' },
          { href: '/info/admin/notifications/history', label: 'History', iconName: 'clock' },
        ],
      },
      { id: 'media-library', label: 'Media Library', iconName: 'image', href: '/info/admin/file-management', requiredRoles: ['admin'] },
      {
        id: 'data',
        label: 'Data',
        iconName: 'data',
        requiredRoles: ['admin'],
        items: [
          { href: '/info/admin/data/retention', label: 'Data Retention', iconName: 'warning', warning: true },
          { href: '/info/admin/data/backups', label: 'Backup & Restore', iconName: 'data', warning: true },
        ],
      },
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
        requiredRoles: ['admin'],
        items: [
          { href: '/info/admin/settings/general', label: 'General', iconName: 'settings', exact: true },
          { href: '/info/admin/settings/email', label: 'Email & Notifications', iconName: 'notifications', exact: true },
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
        requiredRoles: ['admin', 'content_manager', 'moderator', 'analyst'],
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

function AdminSidebarContent({ user, roleLabel = 'System Administrator', onLogout, userRole = 'admin' }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(
      navigationSections.flatMap((section) =>
        section.modules.filter((module) => module.items).map((module) => [module.id, false])
      )
    )
  )
  const [pendingApprovals, setPendingApprovals] = useState(null)

  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      modules: section.modules
        .filter((module) => module.requiredRoles.includes(userRole))
        .map((module) => ({
          ...module,
          items: module.items?.filter((item) => !item.requiredRoles || item.requiredRoles.includes(userRole)),
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
    : isActive(module.href)

  useEffect(() => {
    if (userRole !== 'admin') return undefined

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

      <div id="admin-navigation-drawer" className={`admin-sidebar-drawer fixed left-0 top-0 z-30 flex h-dvh min-h-0 ${sidebarWidth} max-lg:w-[min(22rem,calc(100vw-1rem))] max-lg:max-w-[calc(100vw-1rem)] flex-col border-r transition-all duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="admin-sidebar-brand border-b px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="admin-sidebar-logo flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl">
                <Image
                  src="/logo.png"
                  alt="Connect Daet logo"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-[0.04em]">Connect Daet</p>
                  <p className="admin-sidebar-kicker truncate text-[10px] font-semibold uppercase tracking-[0.18em]">Admin Console</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="admin-sidebar-icon-button flex-shrink-0 rounded-lg p-1.5 transition-all lg:hidden"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="admin-sidebar-icon-button hidden flex-shrink-0 rounded-lg p-1.5 transition-all lg:block"
                title={isCollapsed ? 'Expand' : 'Collapse'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Icon name={isCollapsed ? 'expand' : 'collapse'} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Signed-in administrator */}
          {!isCollapsed && (
            <div className="admin-sidebar-operator mt-4 flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5">
              <div className="admin-sidebar-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="admin-sidebar-name truncate text-xs font-bold">{userName}</p>
                <p className="admin-sidebar-role truncate text-[10px] font-medium uppercase tracking-[0.1em]" title={roleLabel}>{roleLabel}</p>
              </div>
              <span className="admin-sidebar-online h-2.5 w-2.5 flex-shrink-0 rounded-full" title="Online" aria-label="Online" />
            </div>
          )}
        </div>

      <nav className="admin-sidebar-nav min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3" aria-label="Admin navigation">
        {filteredSections.map((section, sectionIndex) => (
          <section key={section.id} className={`admin-nav-section-group admin-nav-section-${section.id}`}>
            {!isCollapsed && (
              <p className={`admin-nav-section ${sectionIndex === 0 ? 'mt-1' : 'mt-4'}`}>{section.label}</p>
            )}
            {section.modules.map((module) => {
              const active = isModuleActive(module)
              const expanded = Boolean(openGroups[module.id] || active && module.items)
              const badge = module.badgeKey === 'pendingApprovals' ? pendingApprovals : module.badge

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
                      {badge > 0 && <span className="admin-nav-badge admin-nav-badge-pending" aria-label={`${badge} pending approvals`}>{badge}</span>}
                    </Link>
                  )}
                </div>
              )
            })}
          </section>
        ))}
      </nav>

      <div className="admin-sidebar-footer shrink-0 border-t p-3">
        <div className={`admin-sidebar-account flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
          <div className="admin-sidebar-avatar flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase" title={isCollapsed ? userName : undefined}>
            {initials}
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
        </div>
        <button
          type="button"
          onClick={handleLogoutClick}
          className="admin-nav-logout mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold"
          title={isCollapsed ? 'Logout' : undefined}
          aria-label="Logout"
        >
          <Icon name="logout" className="h-[18px] w-[18px] flex-shrink-0" />
          {!isCollapsed && <span className="flex-1 text-left">Logout</span>}
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