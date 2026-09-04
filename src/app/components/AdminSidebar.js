'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { clearAuthCookie } from '@/lib/authCookies'
import { Icon } from './Icon'
import ConfirmationModal from './ConfirmationModal'
import logoImage from '../assets/images/logo.png'

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
      { href: '/admin/content', label: 'Overview', iconName: 'content' },
      { href: '/admin/tourist-spots', label: 'Tourist Spots', iconName: 'attractions', badge: null },
      { href: '/admin/events', label: 'Events', iconName: 'events', badge: null },
      { href: '/admin/amenities', label: 'Amenities', iconName: 'amenities', badge: null },
      { href: '/admin/blog', label: 'Blogs & Articles', iconName: 'blog', badge: null },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    iconName: 'community',
    badge: 0,
    requiredRoles: ['admin', 'moderator'],
    items: [
      { href: '/admin/community', label: 'Overview', iconName: 'community' },
      { href: '/admin/forum', label: 'Forums', iconName: 'forum', badge: null },
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
      { href: '/admin/analytics', label: 'Overview', iconName: 'analytics' },
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
      { href: '/admin/settings', label: 'Overview', iconName: 'settings', exact: true },
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
      { href: '/admin/data', label: 'Overview', iconName: 'data' },
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
      { href: '/admin/notifications', label: 'Overview', iconName: 'notifications' },
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
      { href: '/admin/profile', label: 'Profile', iconName: 'profile' },
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const filteredNavigation = navigationHubs.filter((hub) =>
    hub.requiredRoles.includes(userRole)
  )

  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`)
  const isItemActive = (item) => (item.exact ? pathname === item.href : isActive(item.href))

  const toggleItem = (id) => {
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
    sessionStorage.removeItem('user_session')
    clearAuthCookie()
    if (onLogout) {
      await onLogout()
      return
    }
    router.push('/login')
  }

  const sidebarWidth = isCollapsed ? 'w-20' : 'w-72'

  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--admin-sidebar-width', isCollapsed ? '5rem' : '18rem')
    } catch (e) {
      // ignore in non-DOM environments
    }
  }, [isCollapsed])

  return (
    <>
      <div className={`fixed left-0 top-0 z-20 flex h-full ${sidebarWidth} flex-col border-r border-slate-200/60 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)] transition-all duration-300`}>
      {/* Header with Logo */}
      <div className="border-b border-slate-200/60 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-emerald-500 overflow-hidden shadow-lg shadow-sky-500/20">
              <Image
                src={logoImage.src || logoImage}
                alt="DAET Logo"
                width={40}
                height={40}
                className="w-full h-full object-contain p-1"
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-black tracking-[0.15em] text-slate-800">DAET</h1>
                <p className="text-[9px] font-semibold tracking-[0.2em] text-slate-400">ADMIN</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <Icon name={isCollapsed ? 'expand' : 'collapse'} className="w-4 h-4" />
          </button>
        </div>

        {/* User Info - Compact */}
        {!isCollapsed && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-slate-50/80 px-3 py-2.5 border border-slate-100">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-xs font-bold text-white shadow-md shadow-sky-500/25">
              {user?.full_name?.charAt(0) || user?.user_name?.charAt(0) || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-700 truncate">{user?.full_name || user?.user_name || 'Admin'}</p>
              <p className="text-[10px] font-medium text-slate-400 truncate">{roleLabel}</p>
            </div>
            <span className="flex-shrink-0 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-400/30"></span>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {/* Dashboard - Direct Link with active state */}
        <Link
          href="/admin/dashboard"
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 ${
            isActive('/admin/dashboard')
              ? 'bg-gradient-to-r from-sky-600 to-emerald-500 text-white shadow-lg shadow-sky-500/25'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
          }`}
          title={isCollapsed ? 'Dashboard' : ''}
        >
          <Icon name="dashboard" className={`w-5 h-5 flex-shrink-0 ${isActive('/admin/dashboard') ? 'text-white' : ''}`} />
          {!isCollapsed && (
            <span className={`font-medium text-sm ${isActive('/admin/dashboard') ? 'text-white' : 'text-slate-700'}`}>Dashboard</span>
          )}
        </Link>

        {/* Content Management Section */}
        {!isCollapsed && (
          <div className="mt-6">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Main Navigation
            </p>
          </div>
        )}

        {/* Other Hubs with Dropdowns */}
        {filteredNavigation.slice(1).map((hub) => (
          <div key={hub.id} className="mt-1">
            <button
              onClick={() => toggleItem(hub.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-200 ${
                expandedItems[hub.id]
                  ? 'bg-sky-50/80 text-sky-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              }`}
              title={isCollapsed ? hub.label : ''}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon name={hub.iconName} className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && (
                  <>
                    <span className="font-medium text-sm truncate">{hub.label}</span>
                    {hub.badge !== null && hub.badge > 0 && (
                      <span className="ml-auto flex-shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-md shadow-red-500/25">
                        {hub.badge}
                      </span>
                    )}
                  </>
                )}
              </div>
              {!isCollapsed && (
                <Icon
                  name="arrow"
                  className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${
                    expandedItems[hub.id] ? 'rotate-180' : ''
                  }`}
                />
              )}
            </button>

            {!isCollapsed && expandedItems[hub.id] && hub.items && (
              <div className="ml-9 mt-1 space-y-0.5 border-l-2 border-slate-200/60 pl-3 py-1">
                {hub.items.map((item) => {
                  const active = isItemActive(item)
                  return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setExpandedItems((prev) => ({ ...prev, [hub.id]: true }))}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-all duration-200 text-sm ${
                          active
                            ? 'bg-gradient-to-r from-sky-600 to-emerald-500 text-white shadow-md shadow-sky-500/20'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                      <Icon
                        name={item.iconName}
                        className={`w-4 h-4 flex-shrink-0 ${active ? '' : 'opacity-60'}`}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge !== null && item.badge > 0 && (
                        <span className="ml-auto flex-shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Account Section */}
        {!isCollapsed && (
          <div className="mt-6 border-t border-slate-200/60 pt-4">
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              Account
            </p>
          </div>
        )}

        {!isCollapsed && (
          <>
            <Link
              href="/admin/profile"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800"
            >
              <Icon name="profile" className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm">Profile</span>
            </Link>
            <Link
              href="/admin/account"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-800"
            >
              <Icon name="settings" className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium text-sm">Settings</span>
            </Link>
          </>
        )}
      </nav>

      {/* Footer - Logout */}
      <div className="border-t border-slate-200/60 p-3">
        <button
          onClick={handleLogoutClick}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg px-3 py-2.5 text-red-600 transition-all hover:bg-red-50 hover:text-red-700 font-medium text-sm"
          title={isCollapsed ? 'Logout' : ''}
        >
          <Icon name="logout" className="w-5 h-5 flex-shrink-0" />
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