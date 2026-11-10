'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Bookmark, Home, LogOut, Menu, MessageCircle, PlusCircle, Settings, Trophy, UserRound, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import { useUserSettings } from '@/components/UserSettingsProvider'

const UNREAD_REFRESH_INTERVAL_MS = 10_000

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
  { href: '/info/user/blogs/new', labelKey: 'common.createPost', icon: PlusCircle, highlight: true },
  { href: '/info/user/dashboard', labelKey: 'common.home', icon: Home },
  { href: '/info/user/profile', labelKey: 'common.profile', icon: UserRound },
  { href: '/info/user/messaging', labelKey: 'common.messages', icon: MessageCircle },
  { href: '/info/user/saved', labelKey: 'common.saved', icon: Bookmark },
  { href: '/info/user/rewards', labelKey: 'common.rewards', icon: Trophy },
]

export default function MobileNav({ mobileOnly = false }) {
  const { t } = useUserSettings()
  const pathname = usePathname()
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [followingUsers, setFollowingUsers] = useState([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingError, setFollowingError] = useState(false)
  const [followingReloadToken, setFollowingReloadToken] = useState(0)
  const visibleFollowingUsers = followingUsers.slice(0, 5)
  const hasMoreFollowingUsers = followingUsers.length > visibleFollowingUsers.length
  const [userName, setUserName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [userPoints, setUserPoints] = useState(() => Number(getStoredSessionObject()?.points) || 0)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const profileMenuRef = useRef(null)
  const mobileDrawerRef = useRef(null)

  useEffect(() => {
    const handleCommentsSheetState = (event) => setCommentsSheetOpen(Boolean(event.detail?.open))
    window.addEventListener('daet-comments-sheet-state', handleCommentsSheetState)
    return () => window.removeEventListener('daet-comments-sheet-state', handleCommentsSheetState)
  }, [])

  useEffect(() => {
    const openNavigation = () => setMobileDrawerOpen(true)
    const toggleDesktopNavigation = () => setMobileDrawerOpen((open) => !open)
    window.addEventListener('daet-open-mobile-navigation', openNavigation)
    window.addEventListener('daet-toggle-desktop-navigation', toggleDesktopNavigation)
    return () => {
      window.removeEventListener('daet-open-mobile-navigation', openNavigation)
      window.removeEventListener('daet-toggle-desktop-navigation', toggleDesktopNavigation)
    }
  }, [])

  useEffect(() => {
    if (mobileOnly) return undefined

    const desktopViewport = window.matchMedia('(min-width: 1024px)')
    const syncDesktopNavigation = () => setMobileDrawerOpen(desktopViewport.matches)

    syncDesktopNavigation()
    desktopViewport.addEventListener('change', syncDesktopNavigation)
    return () => desktopViewport.removeEventListener('change', syncDesktopNavigation)
  }, [mobileOnly])

  useEffect(() => {
    if (mobileOnly) return undefined

    const desktopViewport = window.matchMedia('(min-width: 1024px)')
    if (desktopViewport.matches && !mobileDrawerOpen) {
      document.documentElement.dataset.userNavigationCollapsed = 'true'
    } else {
      delete document.documentElement.dataset.userNavigationCollapsed
    }

    return () => {
      delete document.documentElement.dataset.userNavigationCollapsed
    }
  }, [mobileDrawerOpen, mobileOnly])

  useEffect(() => {
    if (!mobileDrawerOpen) return undefined

    const mobileViewport = window.matchMedia('(max-width: 1023px)')
    const previousOverflow = document.body.style.overflow
    const syncBodyOverflow = () => {
      document.body.style.overflow = mobileViewport.matches ? 'hidden' : previousOverflow
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileDrawerOpen(false)
    }

    syncBodyOverflow()
    mobileViewport.addEventListener('change', syncBodyOverflow)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      mobileViewport.removeEventListener('change', syncBodyOverflow)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileDrawerOpen])

  useEffect(() => {
    if (!mobileDrawerOpen || !mobileDrawerRef.current) return undefined
    if (
      window.matchMedia('(min-width: 1024px)').matches
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return undefined

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
      setFollowingError(false)
      try {
        const response = await fetch('/info/api/users/following', {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        const result = await response.json()
        if (!response.ok || !result?.success) throw new Error('Unable to load followed users.')
        if (active) setFollowingUsers(result.following_users || [])
      } catch {
        if (active) setFollowingError(true)
      } finally {
        if (active) setFollowingLoading(false)
      }
    }

    void loadFollowing()
    return () => {
      active = false
    }
  }, [mobileDrawerOpen, followingReloadToken])

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
    if (!mobileDrawerOpen) return undefined

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
  }, [mobileDrawerOpen])

  useEffect(() => {
    let active = true
    const session = getStoredSessionObject()
    const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

    const loadUnreadAlerts = async () => {
      try {
        const [notificationsResponse, messagesResponse] = await Promise.all([
          fetch('/info/api/notifications', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/info/api/messages', { credentials: 'same-origin', cache: 'no-store' }),
        ])
        const notificationsResult = notificationsResponse.ok ? await notificationsResponse.json() : null
        const messagesResult = messagesResponse.ok ? await messagesResponse.json() : null
        if (active && notificationsResult?.success) {
          const notifications = Array.isArray(notificationsResult.notifications) ? notificationsResult.notifications : []
          const visibleUnreadCount = notifications.filter((notification) => !notification.is_read).length
          const reportedUnreadCount = Number(notificationsResult.unread_count)
          const unreadCount = notificationsResult.unread_count != null && Number.isFinite(reportedUnreadCount)
            ? Math.max(reportedUnreadCount, visibleUnreadCount)
            : visibleUnreadCount
          setUnreadAlerts(unreadCount)
        }
        if (active && messagesResult?.success) setUnreadMessages(messagesResult.unread_messages || 0)
      } catch {
        // Notifications are optional for the navigation shell.
      }
    }

    loadUnreadAlerts()
    const updateUnreadAlerts = (event) => {
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
    const refreshTimer = window.setInterval(loadUnreadAlerts, UNREAD_REFRESH_INTERVAL_MS)
    let realtimeChannel = null
    if (userId && supabase?.channel) {
      realtimeChannel = supabase.channel(`navigation-realtime-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'info_notifications', filter: `user_id=eq.${userId}` }, () => {
          if (active) void loadUnreadAlerts()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages' }, (payload) => {
          const message = payload?.new || payload?.old
          if (active && message && (message.sender_id === userId || message.recipient_id === userId)) void loadUnreadAlerts()
        })
        .subscribe()
      }

    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', updateUnreadAlerts)
      window.removeEventListener('daet-messages-updated', updateUnreadMessages)
      window.clearInterval(refreshTimer)
      if (realtimeChannel) supabase.removeChannel(realtimeChannel)
    }
  }, [])

  // The mobile top header renders its own bell and message badges, so share the
  // exact unread counts instead of letting it duplicate these two fetches.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('daet-unread-counts', { detail: { unreadAlerts, unreadMessages } }))
  }, [unreadAlerts, unreadMessages])

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
    if (mobileOnly || !window.matchMedia('(min-width: 1024px)').matches) {
      setMobileDrawerOpen(false)
    }
  }

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
      {!mobileOnly && <aside aria-label="Primary navigation" className="usr-desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-700 bg-[#111d2e] text-white shadow-[6px_0_24px_rgba(15,23,42,0.12)]">
        <Link href="/info/user/dashboard" className="flex min-h-20 items-center gap-3 border-b border-slate-700 px-5">
          <img src="/logo.png" alt="Daet tourism logo" className="h-10 w-10 shrink-0 object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-base font-black tracking-tight text-slate-100">Connect-Daet.ai</span>
            <span className="mt-1 block text-[9px] font-medium leading-tight text-slate-400">Daet community</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-5">
          {navItems.map(({ href, labelKey, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/info/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`usr-press flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${highlight ? 'usr-create-post-nav' : ''} ${
                  highlight
                    ? 'my-2 bg-sky-600 text-white shadow-md shadow-sky-950/20 hover:bg-sky-500'
                    : isActive
                      ? 'bg-white/10 text-sky-300'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{t(labelKey)}</span>
                {labelKey === 'common.messages' && unreadMessages > 0 && (
                  <span className="usr-badge flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
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
          <Link href="/info/user/notifications" className="usr-press mb-2 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white">
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
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      {!commentsSheetOpen && mobileDrawerOpen && (
        <div className="usr-navigation-drawer-overlay fixed inset-0 z-[60]">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileDrawerOpen(false)} className="usr-navigation-drawer-backdrop absolute inset-0 h-full w-full bg-black/55" />
          <aside ref={mobileDrawerRef} aria-label="Primary navigation" className="usr-navigation-drawer absolute inset-y-0 left-0 flex w-[min(82vw,280px)] flex-col border-r border-slate-700 bg-[#111d2e] text-white shadow-2xl">
            <div className="usr-navigation-drawer-header flex min-h-16 items-center justify-between border-b border-white/10 px-4">
              <Link href="/info/user/dashboard" onClick={() => setMobileDrawerOpen(false)} className="-ml-1 flex min-w-0 items-center gap-2">
                <img src="/logo.png" alt="" className="h-9 w-8 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className="block truncate text-base font-black tracking-tight">Connect-Daet.ai</span>
                  <span className="mt-0.5 block text-[9px] font-medium leading-tight text-slate-400">Daet community</span>
                </span>
              </Link>
              <button type="button" onClick={() => setMobileDrawerOpen(false)} aria-label="Close navigation" className="usr-press ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Main" className="usr-navigation-drawer-nav flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {navItems.map(({ href, labelKey, icon: Icon, highlight }) => {
                const isActive = pathname === href || (href !== '/info/user/dashboard' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeNavigationAfterSelection}
                    aria-current={isActive ? 'page' : undefined}
                    className={`usr-press usr-navigation-drawer-link flex min-h-12 items-center gap-3 rounded-xl px-3 text-left transition ${
                      highlight ? 'usr-create-post-nav my-2 font-semibold text-white' : isActive ? 'bg-white/10 font-semibold text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 text-sm">{t(labelKey)}</span>
                    {labelKey === 'common.messages' && unreadMessages > 0 && (
                      <span className="usr-badge flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                        {unreadMessages > 9 ? '9+' : unreadMessages}
                      </span>
                    )}
                    {labelKey === 'common.rewards' && (
                      <span className="shrink-0 rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold text-white" aria-label={`${userPoints} points`}>
                        {userPoints.toLocaleString()} pts
                      </span>
                    )}
                  </Link>
                )
              })}
              <section aria-labelledby="mobile-following-heading" className="mt-4 border-t border-white/10 pt-4">
                <h2 id="mobile-following-heading" className="px-3 pb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                  {t('common.following')}
                </h2>
                {followingLoading && <p className="px-3 py-2 text-sm text-slate-400">{t('navigation.following.loading')}</p>}
                {followingError && (
                  <div className="px-3 py-2">
                    <p role="alert" className="text-sm text-red-300">{t('navigation.following.error')}</p>
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
                {!followingLoading && !followingError && visibleFollowingUsers.map((person) => (
                  <Link
                    key={person.id}
                    href={`/info/user/profile/${encodeURIComponent(person.id)}`}
                    onClick={closeNavigationAfterSelection}
                    className="usr-press flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-xs font-bold text-slate-100">
                      {person.profile_image_url
                        ? <img src={person.profile_image_url} alt="" className="h-full w-full object-cover" />
                        : (person.full_name || 'U').trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{person.full_name || 'Community member'}</span>
                  </Link>
                ))}
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