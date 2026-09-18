'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'
import { Icon } from './Icon'
import ConfirmationModal from './ConfirmationModal'

// Hub & Spoke Navigation Structure
const navigationHubs = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconName: 'dashboard',
    href: '/admin/dashboard',
    badge: null,
    requiredRoles: ['admin'],
  },
  {
    id: 'content',
    label: 'Content Management',
    iconName: 'content',
    badge: null,
    requiredRoles: ['admin', 'content_manager'],
    items: [
      { href: '/admin/tourist-spots', label: 'Tourist Spots', iconName: 'attractions', badge: null },
      { href: '/admin/events', label: 'Events', iconName: 'events', badge: null },
      { href: '/admin/blog', label: 'Blogs & Articles', iconName: 'blog', badge: null },
      { href: '/admin/announcement', label: 'Announcements', iconName: 'notifications', badge: null },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    iconName: 'community',
    badge: 0,
    requiredRoles: ['admin', 'moderator'],
    items: [
      { href: '/admin/forum', label: 'Forums', iconName: 'forum', badge: null },
      { href: '/admin/engagement', label: 'Engagement', iconName: 'analytics', badge: null },
      { href: '/admin/feedback', label: 'Feedback', iconName: 'feedback', badge: 0 },
      { href: '/admin/users', label: 'Users', iconName: 'users', badge: null },
      { href: '/admin/moderation', label: 'Moderation Queue', iconName: 'moderation', badge: 0 },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    iconName: 'analytics',
    badge: null,
    requiredRoles: ['admin', 'analyst'],
    items: [
      { href: '/admin/analytics?tab=visitors', label: 'Visitor Statistics', iconName: 'analytics' },
      { href: '/admin/analytics?tab=popular', label: 'Popular Content', iconName: 'analytics' },
      { href: '/admin/analytics?tab=engagement', label: 'User Engagement', iconName: 'analytics' },
      { href: '/admin/analytics?tab=reports', label: 'Export Reports', iconName: 'analytics' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    iconName: 'settings',
    badge: null,
    requiredRoles: ['admin'],
    items: [
      { href: '/admin/settings/general', label: 'General', iconName: 'settings', exact: true },
      { href: '/admin/settings/email', label: 'Email & Notifications', iconName: 'settings', exact: true },
      { href: '/admin/settings/security', label: 'Security', iconName: 'settings', exact: true },
      { href: '/admin/settings/maintenance', label: 'Maintenance Mode', iconName: 'settings', exact: true },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    iconName: 'data',
    badge: null,
    requiredRoles: ['admin'],
    items: [
      { href: '/admin/file-management', label: 'Media Library', iconName: 'data' },
      { href: '/admin/data?tab=backups', label: 'Backups', iconName: 'data' },
      { href: '/admin/data-management', label: 'Import / Export', iconName: 'data' },
      { href: '/admin/data?tab=retention', label: 'Data Retention', iconName: 'data' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    iconName: 'notifications',
    badge: 0,
    requiredRoles: ['admin'],
    items: [
      { href: '/admin/announcement', label: 'Send Announcement', iconName: 'notifications' },
      { href: '/admin/announcement-settings', label: 'Scheduled', iconName: 'notifications' },
      { href: '/admin/announcement?tab=history', label: 'History', iconName: 'notifications' },
    ],
  },
  {
    id: 'account',
    label: 'My Account',
    iconName: 'profile',
    badge: null,
    requiredRoles: ['admin', 'content_manager', 'moderator', 'analyst'],
    items: [
      { href: '/admin/account?tab=password', label: 'Change Password', iconName: 'settings' },
      { href: '/admin/account?tab=2fa', label: '2FA Settings', iconName: 'settings' },
      { href: '/admin/account?tab=sessions', label: 'Sessions', iconName: 'settings' },
    ],
  },
]

export default function AdminSidebar({ user, roleLabel = 'System Administrator', onLogout, userRole = 'admin' }) {
  const pathname = usePathname()
  const router = useRouter()
  const [expandedItems, setExpandedItems] = useState({
    content: false,
    community: false,
    analytics: false,
    settings: false,
    data: false,
    notifications: false,
    account: false,
  })
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const filteredNavigation = navigationHubs.filter((hub) =>
    hub.requiredRoles.includes(userRole)
  )

  const normalizeHref = (href) => href.split('?')[0]
  const isActive = (href) => normalizeHref(pathname) === normalizeHref(href) || normalizeHref(pathname).startsWith(`${normalizeHref(href)}/`)
  const isItemActive = (item) => (item.exact ? normalizeHref(pathname) === normalizeHref(item.href) : isActive(item.href))

  const toggleItem = (id) => {
    if (isCollapsed) {
      setIsCollapsed(false)
      setExpandedItems((prev) => ({ ...prev, [id]: true }))
      return
    }
    setExpandedItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

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
    // /api/logout, the display-only client cookie, storage, and Supabase.
    await performLogout()
    router.push('/login')
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-72'

  useEffect(() => {
    const openHubByPath = () => {
      const nextExpanded = {
        content: false,
        community: false,
        analytics: false,
        settings: false,
        data: false,
        notifications: false,
        account: false,
      }

      const route = normalizeHref(pathname)
      if (['/admin/tourist-spots', '/admin/events', '/admin/blog', '/admin/announcement'].some((entry) => route.startsWith(entry))) {
        nextExpanded.content = true
      }
      if (['/admin/forum', '/admin/engagement', '/admin/feedback', '/admin/users', '/admin/moderation'].some((entry) => route.startsWith(entry))) {
        nextExpanded.community = true
      }
      if (['/admin/analytics'].some((entry) => route.startsWith(entry))) {
        nextExpanded.analytics = true
      }
      if (['/admin/settings/general', '/admin/settings/email', '/admin/settings/security', '/admin/settings/maintenance'].some((entry) => route.startsWith(entry))) {
        nextExpanded.settings = true
      }
      if (['/admin/file-management', '/admin/data', '/admin/data-management'].some((entry) => route.startsWith(entry))) {
        nextExpanded.data = true
      }
      if (['/admin/announcement', '/admin/announcement-settings'].some((entry) => route.startsWith(entry))) {
        nextExpanded.notifications = true
      }
      if (['/admin/account'].some((entry) => route.startsWith(entry))) {
        nextExpanded.account = true
      }

      setExpandedItems((previous) => ({ ...previous, ...nextExpanded }))
    }

    openHubByPath()
  }, [pathname])

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

      <div id="admin-navigation-drawer" className={`fixed left-0 top-0 z-30 flex h-dvh ${sidebarWidth} max-lg:w-72 max-lg:max-w-[calc(100vw-2rem)] flex-col border-r border-slate-200/60 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition-all duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="border-b border-slate-200/60 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-teal-700 to-emerald-500 shadow-lg shadow-teal-900/20">
                <Image
                  src="/logo.png"
                  alt="DAET Tourism logo"
                  width={40}
                  height={40}
                  className="h-full w-full object-contain p-1"
                />
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-[0.08em] text-slate-900">DAET TOURISM</p>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Admin Console
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 lg:hidden"
                aria-label="Close navigation menu"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="hidden flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 lg:block"
                title={isCollapsed ? 'Expand' : 'Collapse'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Icon name={isCollapsed ? 'expand' : 'collapse'} className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Signed-in operator */}
          {!isCollapsed && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-700 to-emerald-500 text-xs font-bold uppercase text-white shadow-sm">
                {user?.full_name?.charAt(0) || user?.user_name?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-700">{user?.full_name || user?.user_name || 'Admin'}</p>
                <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-slate-400">{roleLabel}</p>
              </div>
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500 shadow-sm" title="Signed in" aria-hidden="true" />
            </div>
          )}
        </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Admin navigation">
        {/* Dashboard - Direct Link with active state */}
        <Link
          href="/admin/dashboard"
          onClick={() => setMobileOpen(false)}
          className="admin-nav-item"
          data-active={isActive('/admin/dashboard')}
          title={isCollapsed ? 'Dashboard' : undefined}
        >
          <Icon name="dashboard" className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="flex-1 truncate">Dashboard</span>}
        </Link>

        {!isCollapsed && <p className="admin-nav-section mt-5">Workspaces</p>}

        {/* Other Hubs with Dropdowns */}
        {filteredNavigation.filter((hub) => hub.items).map((hub) => (
          <div key={hub.id} className="mt-1">
            <button
              type="button"
              onClick={() => toggleItem(hub.id)}
              aria-expanded={!isCollapsed && Boolean(expandedItems[hub.id])}
              aria-controls={`admin-navigation-${hub.id}`}
              className="admin-nav-group"
              title={isCollapsed ? hub.label : undefined}
            >
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <Icon name={hub.iconName} className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span className="truncate">{hub.label}</span>}
              </span>
              {!isCollapsed && hub.badge !== null && hub.badge > 0 && (
                <span className="admin-nav-badge">{hub.badge}</span>
              )}
              {!isCollapsed && (
                <Icon
                  name="arrow"
                  className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${
                    expandedItems[hub.id] ? 'rotate-180' : ''
                  }`}
                />
              )}
            </button>

            {!isCollapsed && expandedItems[hub.id] && hub.items && (
              <div id={`admin-navigation-${hub.id}`} className="admin-nav-sub">
                {hub.items.map((item) => {
                  const active = isItemActive(item)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setExpandedItems((prev) => ({ ...prev, [hub.id]: true }))
                        setMobileOpen(false)
                      }}
                      className="admin-nav-item"
                      data-active={active}
                    >
                      <Icon
                        name={item.iconName}
                        className={`h-4 w-4 flex-shrink-0 ${active ? '' : 'opacity-60'}`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge !== null && item.badge > 0 && (
                        <span className="admin-nav-badge">{item.badge}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Account Section */}
        {!isCollapsed && <p className="admin-nav-section mt-5">Account</p>}

        <Link
          href="/admin/account"
          onClick={() => setMobileOpen(false)}
          className="admin-nav-item"
          data-active={isActive('/admin/account')}
          title={isCollapsed ? 'Account & settings' : undefined}
        >
          <Icon name="settings" className="h-5 w-5 flex-shrink-0" />
          {!isCollapsed && <span className="flex-1 truncate">Account &amp; Settings</span>}
        </Link>
      </nav>

      {/* Footer - Logout */}
      <div className="border-t border-slate-200/60 p-3">
        <button
          type="button"
          onClick={handleLogoutClick}
          className="admin-btn admin-btn-ghost admin-nav-logout w-full"
          title={isCollapsed ? 'Logout' : undefined}
          aria-label="Logout"
        >
          <Icon name="logout" className="h-4 w-4 flex-shrink-0" />
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