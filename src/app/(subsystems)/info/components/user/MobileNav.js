'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Bookmark, CalendarDays, CircleHelp, Home, LogOut, MessageCircle, Plus, PlusCircle, Search, Settings, Siren, Trophy, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import { useUserSettings } from '@/components/UserSettingsProvider'
import { getActiveNavigationHref } from '@/lib/routeMatching.mjs'

function readStoredUserId() {
  if (typeof window === 'undefined') return ''
  try {
    const session = getStoredSessionObject()
    return session?.user_id || session?.id || session?.userId || session?.sub || ''
  } catch {
    return ''
  }
}

function readStoredIdentity() {
  if (typeof window === 'undefined') return { name: '', avatarUrl: '' }
  try {
    const session = getStoredSessionObject()
    return {
      name: session?.user_name || session?.full_name || session?.user_email?.split('@')[0] || '',
      avatarUrl: session?.avatar_url || session?.profile_image_url || '',
    }
  } catch {
    return { name: '', avatarUrl: '' }
  }
}

function getNavInitials(name = '') {
  return (name || 'T').split(' ').slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'T'
}

const navItems = [
  { href: '/info/user/blogs/new', labelKey: 'common.createPost', icon: PlusCircle, exact: true },
  { href: '/info/user/dashboard', labelKey: 'common.home', icon: Home, exact: true },
  { href: '/info/user/profile', labelKey: 'common.profile', icon: UserRound },
  { href: '/info/user/dashboard#faq-heading', label: 'Frequently asked questions', icon: CircleHelp },
  { href: '/info/user/saved', labelKey: 'common.saved', icon: Bookmark },
  { href: '/info/visitor/alerts', labelKey: 'common.alerts', icon: Siren },
  { href: '/info/user/rewards', labelKey: 'common.rewards', icon: Trophy },
]

export default function MobileNav({ mobileOnly = false }) {
  const { t } = useUserSettings()
  const pathname = usePathname()
  const activeSidebarHref = getActiveNavigationHref(pathname, [
    ...navItems,
    { href: '/info/user/notifications', exact: true },
  ])
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [desktopNavigationCollapsed, setDesktopNavigationCollapsed] = useState(false)
  const [followingUsers, setFollowingUsers] = useState([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingError, setFollowingError] = useState('')
  const [followingReloadToken, setFollowingReloadToken] = useState(0)
  const visibleFollowingUsers = followingUsers.slice(0, 5)
  const hasMoreFollowingUsers = followingUsers.length > visibleFollowingUsers.length
  const [userName, setUserName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [userPoints, setUserPoints] = useState(() => Number(getStoredSessionObject()?.points) || 0)
  const [notificationUserId] = useState(() => readStoredUserId())
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const profileMenuRef = useRef(null)
  const mobileDrawerRef = useRef(null)
  const notificationRealtime = useRealtimeRefresh({
    channelName: `navigation-realtime-${notificationUserId || 'uninitialized'}`,
    tables: notificationUserId
      ? [
          { table: 'info_notifications', filter: `user_id=eq.${notificationUserId}` },
          'direct_messages',
        ]
      : [],
    enabled: Boolean(notificationUserId),
    shouldRefreshEvent: (payload) => {
      if (payload?.table === 'direct_messages') {
        const message = payload?.new || payload?.old
        if (message?.sender_id !== notificationUserId && message?.recipient_id !== notificationUserId) return false
      }
      if (payload?.table === 'info_notifications') {
        window.dispatchEvent(new CustomEvent('daet-notifications-updated', {
          detail: { refreshPreview: true },
        }))
      }
      return true
    },
  })
  const { setRefreshCallback } = notificationRealtime

  useEffect(() => {
    const handleCommentsSheetState = (event) => setCommentsSheetOpen(Boolean(event.detail?.open))
    window.addEventListener('daet-comments-sheet-state', handleCommentsSheetState)
    return () => window.removeEventListener('daet-comments-sheet-state', handleCommentsSheetState)
  }, [])

  useEffect(() => {
    const toggleDesktopNavigation = () => {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setDesktopNavigationCollapsed((collapsed) => !collapsed)
      } else {
        setMobileDrawerOpen((open) => !open)
      }
    }
    window.addEventListener('daet-toggle-desktop-navigation', toggleDesktopNavigation)
    return () => {
      window.removeEventListener('daet-toggle-desktop-navigation', toggleDesktopNavigation)
    }
  }, [])

  useEffect(() => {
    if (mobileOnly) return undefined
    if (desktopNavigationCollapsed) {
      document.documentElement.dataset.userNavigationCollapsed = 'true'
    } else {
      delete document.documentElement.dataset.userNavigationCollapsed
    }

    return () => {
      delete document.documentElement.dataset.userNavigationCollapsed
    }
  }, [desktopNavigationCollapsed, mobileOnly])

  useEffect(() => {
    if (!mobileDrawerOpen) return undefined

    const mobileViewport = window.matchMedia('(max-width: 1023px)')
    const body = document.body
    const documentElement = document.documentElement
    const previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    const previousDocumentOverflow = documentElement.style.overflow
    let lockedScrollY = 0
    let scrollLocked = false

    const unlockScroll = () => {
      if (!scrollLocked) return
      body.style.overflow = previousBodyStyles.overflow
      body.style.position = previousBodyStyles.position
      body.style.top = previousBodyStyles.top
      body.style.left = previousBodyStyles.left
      body.style.right = previousBodyStyles.right
      body.style.width = previousBodyStyles.width
      documentElement.style.overflow = previousDocumentOverflow
      window.scrollTo(0, lockedScrollY)
      scrollLocked = false
    }
    const syncScrollLock = () => {
      if (!mobileViewport.matches) {
        unlockScroll()
        return
      }
      if (scrollLocked) return

      lockedScrollY = window.scrollY
      documentElement.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      body.style.position = 'fixed'
      body.style.top = `-${lockedScrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
      scrollLocked = true
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileDrawerOpen(false)
    }

    syncScrollLock()
    mobileViewport.addEventListener('change', syncScrollLock)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      mobileViewport.removeEventListener('change', syncScrollLock)
      unlockScroll()
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileDrawerOpen])

  useEffect(() => {
    if (!mobileDrawerOpen || !mobileDrawerRef.current) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    const animation = mobileDrawerRef.current.animate(
      [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'cubic-bezier(0.22, 0.8, 0.32, 1)', fill: 'both' },
    )
    return () => animation.cancel()
  }, [mobileDrawerOpen])

  useEffect(() => {
    if (!mobileDrawerOpen) return undefined

    let active = true
    const loadFollowing = async () => {
      setFollowingLoading(true)
      setFollowingError('')
      try {
        const response = await fetch('/info/api/users/following', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.success) {
          throw new Error(result?.message || `Unable to load followed users (HTTP ${response.status}).`)
        }
        if (active) setFollowingUsers(result.following_users || [])
      } catch (error) {
        if (active) setFollowingError(error instanceof Error ? error.message : t('navigation.following.error'))
      } finally {
        if (active) setFollowingLoading(false)
      }
    }

    void loadFollowing()
    return () => {
      active = false
    }
  }, [mobileDrawerOpen, followingReloadToken, t])

  useEffect(() => {
    // Deferred so the effect body does not trigger synchronous state updates
    // (same pattern used by the settings page).
    const timer = window.setTimeout(() => {
      const identity = readStoredIdentity()
      setUserName((current) => current || identity.name)
      setUserAvatarUrl((current) => current || identity.avatarUrl)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('daet-user-identity', {
      detail: { name: userName, avatarUrl: userAvatarUrl },
    }))
  }, [userName, userAvatarUrl])

  useEffect(() => {
    const userId = readStoredUserId()
    if (!userId || !supabase) return undefined

    let active = true
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase.from('info_users').select('full_name, profile_image_url, points').eq('id', userId).maybeSingle()
        if (error) throw error
        if (!active) return
        if (data?.full_name?.trim()) setUserName(data.full_name.trim())
        if (data?.profile_image_url) setUserAvatarUrl(data.profile_image_url)
        if (Number.isFinite(Number(data?.points))) setUserPoints(Number(data.points))
      } catch (error) {
        console.error('Unable to load navigation profile and rewards:', error)
      }
    }

    void loadProfile()
    const updatePoints = (event) => {
      const points = Number(event?.detail?.points)
      if (Number.isFinite(points)) setUserPoints(points)
    }
    window.addEventListener('daet-user-points-updated', updatePoints)
    return () => {
      active = false
      window.removeEventListener('daet-user-points-updated', updatePoints)
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadUnreadAlerts = async () => {
      try {
        const [notificationsResponse, messagesResponse] = await Promise.all([
          fetch('/info/api/notifications', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/info/api/messages', { credentials: 'same-origin', cache: 'no-store' }),
        ])
        const notificationsResult = await notificationsResponse.json()
        if (!notificationsResponse.ok) {
          const errorCode = typeof notificationsResult?.code === 'string'
            ? ` [${notificationsResult.code}]`
            : ''
          const errorMessage = typeof notificationsResult?.message === 'string'
            ? ` ${notificationsResult.message}`
            : ''
          throw new Error(`Notification refresh failed with status ${notificationsResponse.status}${errorCode}.${errorMessage}`)
        }
        if (!notificationsResult?.success) {
          throw new Error(notificationsResult?.message || 'Notification refresh failed.')
        }
        const messagesResult = messagesResponse.ok ? await messagesResponse.json() : null
        if (active) {
          const notifications = Array.isArray(notificationsResult.notifications) ? notificationsResult.notifications : []
          const visibleUnreadCount = notifications.filter((notification) => !notification.is_read).length
          const reportedUnreadCount = Number(notificationsResult.unread_count)
          const unreadCount = notificationsResult.unread_count != null && Number.isFinite(reportedUnreadCount)
            ? Math.max(reportedUnreadCount, visibleUnreadCount)
            : visibleUnreadCount
          setUnreadAlerts(unreadCount)
          window.dispatchEvent(new CustomEvent('daet-notifications-updated', {
            detail: { unreadCount },
          }))
        }
        if (active && messagesResult?.success) setUnreadMessages(messagesResult.unread_messages || 0)
        if (active && !messagesResponse.ok) {
          console.error('Unread message refresh failed:', messagesResponse.status)
        }
      } catch (error) {
        if (active) console.error('Unread notification refresh failed:', error)
        return false
      }
      return true
    }

    setRefreshCallback(loadUnreadAlerts)
    loadUnreadAlerts()
    const updateUnreadAlerts = (event) => {
      if (event?.detail?.refreshPreview) return
      const detailUnreadCount = Number(event?.detail?.unreadCount)

      if (Number.isFinite(detailUnreadCount)) {
        setUnreadAlerts(detailUnreadCount)
        return
      }

      void loadUnreadAlerts()
    }

    const updateUnreadMessages = () => {
      void loadUnreadAlerts()
    }

    window.addEventListener('daet-notifications-updated', updateUnreadAlerts)
    window.addEventListener('daet-messages-updated', updateUnreadMessages)

    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', updateUnreadAlerts)
      window.removeEventListener('daet-messages-updated', updateUnreadMessages)
    }
  }, [setRefreshCallback])

  // The mobile top header renders its own bell and message badges, so share the
  // exact unread counts instead of letting it duplicate these two fetches.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('daet-unread-counts', { detail: { unreadAlerts, unreadMessages } }))
  }, [unreadAlerts, unreadMessages])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('daet-user-points-updated', { detail: { points: userPoints } }))
  }, [userPoints])

  useEffect(() => {
    if (!showProfileMenu) return undefined
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) setShowProfileMenu(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProfileMenu])

  const getInitials = (name = '') => getNavInitials(name)

  const closeNavigationAfterSelection = () => {
    setMobileDrawerOpen(false)
  }

  const isVisitor = pathname === '/info/visitor' || pathname.startsWith('/info/visitor/')
  const mobileNavigationItems = [
    { href: isVisitor ? '/info/visitor' : '/info/user/dashboard', label: t('common.home'), icon: Home, exact: true },
    { href: isVisitor ? '/info/visitor/search' : '/info/user/search', label: t('common.search'), icon: Search },
    { href: '/info/user/blogs/new', label: t('common.create'), icon: Plus, exact: true, isCreate: true },
    { href: '/info/user/messaging', label: t('common.messages'), icon: MessageCircle, unreadCount: unreadMessages },
    { href: '/info/user/profile', label: t('common.profile'), icon: UserRound },
  ]
  const activeMobileHref = getActiveNavigationHref(pathname, mobileNavigationItems)

  const openLogoutConfirm = () => {
    setMobileDrawerOpen(false)
    setShowProfileMenu(false)
    setShowLogoutConfirm(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    try {
      await performLogout()
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      window.location.assign('/info/login')
    }
  }

  return (
    <>
      {!mobileOnly && (
        <nav className="usr-mobile-bottom-nav lg:hidden" aria-label="Primary navigation">
          {mobileNavigationItems.map(({ href, label, icon: Icon, isCreate, unreadCount }) => {
            const isActive = activeMobileHref === href
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                className={`usr-mobile-bottom-nav-link${isActive ? ' is-active' : ''}${isCreate ? ' is-create' : ''}`}
              >
                <span className="usr-mobile-bottom-nav-icon">
                  <Icon aria-hidden="true" />
                  {unreadCount > 0 && (
                    <span className="usr-mobile-bottom-nav-badge" aria-label={`${unreadCount} unread messages`}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                <span className="usr-mobile-bottom-nav-label">{label}</span>
              </Link>
            )
          })}
        </nav>
      )}
      {!mobileOnly && <aside aria-label="Primary navigation" className={`usr-desktop-sidebar fixed left-0 z-40 hidden w-[302px] flex-col border-r border-slate-700 bg-[#111d2e] text-white shadow-[6px_0_24px_rgba(15,23,42,0.12)] lg:flex lg:top-16 lg:bottom-0${desktopNavigationCollapsed ? ' lg:hidden' : ''}`}>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-5">
          {navItems.map(({ href, labelKey, label, icon: Icon }) => {
            const isActive = activeSidebarHref === href
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`usr-press flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                  isActive ? 'bg-white/10 text-sky-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{label || t(labelKey)}</span>
                {labelKey === 'common.rewards' && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white" aria-label={`${userPoints} points`}>
                    {userPoints.toLocaleString()} pts
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-slate-700 p-3">
          <Link
            href="/info/user/notifications"
            aria-current={activeSidebarHref === '/info/user/notifications' ? 'page' : undefined}
            className={`usr-press mb-2 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
              activeSidebarHref === '/info/user/notifications'
                ? 'bg-white/10 text-sky-300'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Bell className="h-5 w-5 shrink-0" />
            <span className="flex-1">{t('common.notifications')}</span>
            {unreadAlerts > 0 && (
              <span className="usr-badge flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadAlerts > 9 ? '9+' : unreadAlerts}
              </span>
            )}
          </Link>
          <div className="relative" ref={profileMenuRef}>
            <button type="button" onClick={() => setShowProfileMenu((open) => !open)} aria-haspopup="menu" aria-expanded={showProfileMenu} aria-label="Account menu" className="usr-press flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-slate-200 transition hover:bg-white/10 hover:text-white">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : (userName ? getInitials(userName) : <UserRound className="h-4 w-4" aria-hidden="true" />)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{userName || t('common.profile')}</span>
              <Settings className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
            {showProfileMenu && (
              <div role="menu" className="usr-pop-in absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <Link role="menuitem" href="/info/user/profile" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" aria-hidden="true" />{t('common.profile')}</Link>
                <Link role="menuitem" href="/info/user/events/calendar" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4" aria-hidden="true" />Event Calendar</Link>
                <Link role="menuitem" href="/info/user/settings" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" aria-hidden="true" />{t('common.settings')}</Link>
                <div className="my-1 border-t border-slate-100" role="separator" />
                <button role="menuitem" type="button" onClick={openLogoutConfirm} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" aria-hidden="true" />{t('common.logOut')}</button>
              </div>
            )}
          </div>
        </div>
      </aside>}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title={t('common.confirmLogout')}
        message={t('common.confirmLogoutMessage')}
        confirmText={loggingOut ? t('common.loggingOut') : t('common.ok')}
        cancelText={t('common.cancel')}
        isDangerous
        hideNavigation
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      {!commentsSheetOpen && mobileDrawerOpen && (
        <div className="usr-navigation-drawer-overlay fixed inset-x-0 bottom-0 top-[100px] z-40 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileDrawerOpen(false)} className="usr-navigation-drawer-backdrop absolute inset-0 h-full w-full bg-transparent" />
          <aside ref={mobileDrawerRef} aria-label="Primary navigation" className="usr-navigation-drawer absolute inset-0 flex w-full flex-col border-0 bg-[#111d2e] text-white shadow-none">
            <nav aria-label="Main" className="usr-navigation-drawer-nav flex-1 space-y-[7px] overflow-y-auto">
              {navItems.map(({ href, labelKey, label, icon: Icon }) => {
                const isActive = activeSidebarHref === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeNavigationAfterSelection}
                    aria-current={isActive ? 'page' : undefined}
                    className={`usr-press usr-navigation-drawer-link flex items-center text-left transition ${
                      isActive ? 'font-semibold' : ''
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-sm">{label || t(labelKey)}</span>
                    {labelKey === 'common.rewards' && (
                      <span className="shrink-0 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white" aria-label={`${userPoints} points`}>
                        {userPoints.toLocaleString()} pts
                      </span>
                    )}
                  </Link>
                )
              })}
              <section aria-labelledby="mobile-following-heading" className="usr-navigation-following">
                <h2 id="mobile-following-heading" className="text-lg font-semibold text-slate-400">
                  {t('common.following')}
                </h2>
                {followingLoading && (
                  <div role="status" aria-label={t('navigation.following.loading')} className="usr-navigation-following-list">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="flex items-center gap-4 px-2 py-2">
                        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-slate-700" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-700" />
                          <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {followingError && (
                  <div className="px-3 py-2">
                    <p role="alert" className="text-sm text-red-300">{followingError}</p>
                    <button
                      type="button"
                      onClick={() => setFollowingReloadToken((token) => token + 1)}
                      className="mt-2 text-sm font-semibold text-sky-300 underline underline-offset-2"
                    >
                      {t('navigation.following.retry')}
                    </button>
                  </div>
                )}
                {!followingLoading && !followingError && followingUsers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400">{t('navigation.following.empty')}</p>
                )}
                {!followingLoading && !followingError && visibleFollowingUsers.length > 0 && (
                  <div className="usr-navigation-following-list">
                    {visibleFollowingUsers.map((person) => (
                      <Link
                        key={person.id}
                        href={`/info/user/profile/${encodeURIComponent(person.id)}`}
                        onClick={closeNavigationAfterSelection}
                        className="usr-press flex items-center gap-3 px-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-xs font-bold text-slate-100">
                          {person.profile_image_url
                            ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" />
                            : (person.full_name || 'U').trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{person.full_name || 'Community member'}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {!followingLoading && !followingError && hasMoreFollowingUsers && (
                  <Link
                    href="/info/user/profile/connections?tab=following"
                    onClick={closeNavigationAfterSelection}
                    className="usr-navigation-show-all mt-2 inline-flex w-full items-center justify-center rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 hover:text-white"
                  >
                    Show all
                  </Link>
                )}
              </section>
            </nav>
          </aside>
        </div>
      )}
    </>
  )
}