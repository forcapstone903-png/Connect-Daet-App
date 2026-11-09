'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Form from 'next/form'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, LogOut, Menu, Search, Settings, Sparkles, UserRound } from 'lucide-react'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import AppearanceSection from '@/app/(subsystems)/info/user/settings/_components/AppearanceSection'
import MobileNav from '@/app/(subsystems)/info/components/user/MobileNav'
import UserProfileLink from '@/app/(subsystems)/info/components/user/UserProfileLink'
import { useUserSettings } from '@/components/UserSettingsProvider'
import { useUserSearchSuggestions } from '@/lib/useUserSearchSuggestions'

function getStoredIdentity() {
  const session = getStoredSessionObject()
  return {
    name: session?.user_name || session?.full_name || session?.user_email?.split('@')[0] || '',
    avatarUrl: session?.avatar_url || session?.profile_image_url || '',
  }
}

function getInitials(name = '') {
  return (name || 'U').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'U'
}

function formatNotificationTime(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function UserTopHeader({
  detailMode = false,
  spacer = true,
  homeHref = '/info/user/dashboard',
  standaloneNavigation = false,
  desktopOnly = false,
  edgeToEdgeMobile = false,
  showDesktopNavigationToggle = true,
}) {
  const { settings, resolvedTheme, t, updateSettings } = useUserSettings()
  const pathname = usePathname()
  const router = useRouter()
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [desktopNotifications, setDesktopNotifications] = useState([])
  const [desktopNotificationsOpen, setDesktopNotificationsOpen] = useState(false)
  const [desktopNotificationsLoading, setDesktopNotificationsLoading] = useState(false)
  const [desktopNotificationsError, setDesktopNotificationsError] = useState('')
  const [desktopNotificationsRefreshKey, setDesktopNotificationsRefreshKey] = useState(0)
  const [desktopSearchQuery, setDesktopSearchQuery] = useState('')
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false)
  const { users: suggestedUsers, loading: suggestedUsersLoading } = useUserSearchSuggestions(desktopSearchQuery, desktopSearchFocused)
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const searches = JSON.parse(window.localStorage.getItem('daet_recent_searches') || '[]')
      return Array.isArray(searches) ? searches.filter((search) => typeof search === 'string').slice(0, 5) : []
    } catch {
      return []
    }
  })
  const [identity, setIdentity] = useState({ name: '', avatarUrl: '' })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [appearanceDraft, setAppearanceDraft] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const profileMenuRef = useRef(null)
  const desktopProfileMenuRef = useRef(null)
  const desktopNotificationsRef = useRef(null)
  const desktopSearchInputRef = useRef(null)
  const appearanceTriggerRef = useRef(null)
  const appearanceDialogRef = useRef(null)

  const openAppearance = useCallback((event) => {
    const menu = event.currentTarget.closest('[role="menu"]')
    appearanceTriggerRef.current = menu?.parentElement?.querySelector('button[aria-haspopup="menu"]') || event.currentTarget
    setAppearanceDraft({
      theme: settings.theme,
      reduceMotion: settings.reduceMotion,
    })
    setProfileMenuOpen(false)
    setAppearanceOpen(true)
  }, [settings.theme, settings.reduceMotion])

  const closeAppearance = useCallback(() => {
    setAppearanceOpen(false)
  }, [])

  const applyAppearance = useCallback(() => {
    if (appearanceDraft) updateSettings(appearanceDraft)
    setAppearanceOpen(false)
  }, [appearanceDraft, updateSettings])

  useEffect(() => {
    if (!appearanceOpen) return undefined

    const trigger = appearanceTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAppearance()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = appearanceDialogRef.current?.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    appearanceDialogRef.current?.querySelector('button')?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      trigger?.focus()
    }
  }, [appearanceOpen, closeAppearance])

  const saveRecentSearch = (value) => {
    const search = value.trim()
    if (!search) return

    const searches = [search, ...recentSearches.filter((recent) => recent.toLowerCase() !== search.toLowerCase())].slice(0, 5)
    setRecentSearches(searches)
    try {
      window.localStorage.setItem('daet_recent_searches', JSON.stringify(searches))
      window.dispatchEvent(new CustomEvent('daet-recent-searches-updated', { detail: { searches } }))
    } catch (error) {
      console.error('Unable to save recent search:', error)
    }
  }

  const clearRecentSearches = () => {
    try {
      window.localStorage.removeItem('daet_recent_searches')
      setRecentSearches([])
      window.dispatchEvent(new CustomEvent('daet-recent-searches-updated', { detail: { searches: [] } }))
    } catch (error) {
      console.error('Unable to clear recent searches:', error)
    }
  }

  const selectDesktopSearch = (value) => {
    const search = value.trim()
    if (!search) return

    saveRecentSearch(search)
    setDesktopSearchQuery(search)
    setDesktopSearchFocused(false)
    if (desktopSearchInputRef.current) desktopSearchInputRef.current.value = search
    if (pathname === '/info/visitor/search') {
      window.dispatchEvent(new CustomEvent('daet-search-input', { detail: { query: search } }))
    } else {
      router.push(`/info/visitor/search?q=${encodeURIComponent(search)}`)
    }
  }

  const matchingRecentSearches = recentSearches
    .filter((search) => !desktopSearchQuery.trim() || search.toLowerCase().includes(desktopSearchQuery.trim().toLowerCase()))
    .slice(0, 4)
  const hasExactRecentSearch = recentSearches.some((search) => search.toLowerCase() === desktopSearchQuery.trim().toLowerCase())

  useEffect(() => {
    const input = desktopSearchInputRef.current
    if (!input) return

    const query = pathname === '/info/visitor/search'
      ? new URLSearchParams(window.location.search).get('q') || ''
      : ''
    if (input.value !== query) input.value = query
  }, [pathname])

  useEffect(() => {
    const handleRecentSearchesUpdate = (event) => {
      const searches = event.detail?.searches
      if (Array.isArray(searches)) setRecentSearches(searches)
    }
    const handleStorage = (event) => {
      if (event.key !== 'daet_recent_searches' && event.key !== null) return
      try {
        const searches = JSON.parse(event.newValue || '[]')
        setRecentSearches(Array.isArray(searches) ? searches.filter((search) => typeof search === 'string').slice(0, 5) : [])
      } catch (error) {
        console.error('Unable to read recent searches:', error)
      }
    }
    window.addEventListener('daet-recent-searches-updated', handleRecentSearchesUpdate)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('daet-recent-searches-updated', handleRecentSearchesUpdate)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setIdentity(getStoredIdentity()), 0)
    const handleIdentityUpdate = (event) => {
      setIdentity({
        name: event.detail?.name || '',
        avatarUrl: event.detail?.avatarUrl || '',
      })
    }
    window.addEventListener('daet-user-identity', handleIdentityUpdate)

    let active = true

    const loadUnreadAlerts = async () => {
      try {
        const response = await fetch('/info/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
        const result = response.ok ? await response.json() : null
        if (active && result?.success) {
          const visibleUnreadCount = (result.notifications || []).filter((notification) => !notification.is_read).length
          const reportedUnreadCount = Number(result.unread_count)
          const unreadCount = result.unread_count != null && Number.isFinite(reportedUnreadCount)
            ? Math.max(reportedUnreadCount, visibleUnreadCount)
            : visibleUnreadCount
          setUnreadAlerts(unreadCount)
        }
      } catch {
        // Notifications are optional for the navigation shell.
      }
    }

    loadUnreadAlerts()
    const handleUpdate = (event) => {
      const count = Number(event?.detail?.unreadCount)
      if (Number.isFinite(count)) setUnreadAlerts(count)
      else void loadUnreadAlerts()
      if (desktopNotificationsOpen) setDesktopNotificationsRefreshKey((key) => key + 1)
    }
    window.addEventListener('daet-notifications-updated', handleUpdate)
    // MobileNav owns the polling loop for both counts on the user shell, so reuse
    // its values here instead of hitting /info/api/notifications twice.
    const handleSharedCounts = (event) => {
      const alerts = Number(event?.detail?.unreadAlerts)
      if (Number.isFinite(alerts)) setUnreadAlerts(alerts)
    }
    window.addEventListener('daet-unread-counts', handleSharedCounts)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.removeEventListener('daet-notifications-updated', handleUpdate)
      window.removeEventListener('daet-unread-counts', handleSharedCounts)
      window.removeEventListener('daet-user-identity', handleIdentityUpdate)
    }
  }, [desktopNotificationsOpen])

  useEffect(() => {
    if (!desktopNotificationsOpen) return undefined

    const controller = new AbortController()
    let active = true
    const loadNotifications = async () => {
      setDesktopNotificationsLoading(true)
      setDesktopNotificationsError('')
      try {
        const response = await fetch('/info/api/notifications', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Unable to load notifications.')
        }

        if (!active) return
        const notifications = Array.isArray(result.notifications) ? result.notifications : []
        setDesktopNotifications(notifications.slice(0, 5))
        const visibleUnreadCount = notifications.filter((notification) => !notification.is_read).length
        const reportedUnreadCount = Number(result.unread_count)
        const unreadCount = result.unread_count != null && Number.isFinite(reportedUnreadCount)
          ? Math.max(reportedUnreadCount, visibleUnreadCount)
          : visibleUnreadCount
        setUnreadAlerts(unreadCount)
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        console.error('Desktop notifications fetch failed:', error)
        setDesktopNotificationsError('Notifications could not be loaded. Please try again.')
      } finally {
        if (active) setDesktopNotificationsLoading(false)
      }
    }

    void loadNotifications()
    return () => {
      active = false
      controller.abort()
    }
  }, [desktopNotificationsOpen, desktopNotificationsRefreshKey])

  useEffect(() => {
    if (!desktopNotificationsOpen && !profileMenuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (
        desktopNotificationsOpen
        && !desktopNotificationsRef.current?.contains(event.target)
      ) setDesktopNotificationsOpen(false)
      if (
        profileMenuOpen
        && !desktopProfileMenuRef.current?.contains(event.target)
        && !profileMenuRef.current?.contains(event.target)
      ) setProfileMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setDesktopNotificationsOpen(false)
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [desktopNotificationsOpen, profileMenuOpen])

  useEffect(() => {
    if (!profileMenuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      const inMobileMenu = profileMenuRef.current?.contains(event.target)
      const inDesktopMenu = desktopProfileMenuRef.current?.contains(event.target)
      if (!inMobileMenu && !inDesktopMenu) setProfileMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [profileMenuOpen])

  const handleLogout = async () => {
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
      {standaloneNavigation && !desktopOnly && <MobileNav mobileOnly />}
      <header className="usr-desktop-header fixed inset-x-0 top-0 z-50 hidden h-16 items-center gap-5 border-b border-white/10 bg-[#171717] px-6 text-slate-100 shadow-sm lg:flex">
        {showDesktopNavigationToggle && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('daet-toggle-desktop-navigation'))}
            aria-label="Toggle navigation"
            className="usr-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Link href={homeHref} className="usr-press flex shrink-0 items-center gap-2">
          <img src="/logo.png" alt="" className="h-10 w-8 shrink-0 object-contain" />
          <span className="min-w-0">
            <span className="usr-desktop-header-brand-title block font-serif text-[23px] font-bold leading-none tracking-tight">Connect-Daet.ai</span>
            <span className="usr-desktop-header-brand-subtitle mt-1 block whitespace-nowrap text-[8px] font-medium leading-none">Subsystem 1: Daet Tourist Information, Engagement &amp; Management System</span>
          </span>
        </Link>
        <Form
          action="/info/visitor/search"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            selectDesktopSearch(desktopSearchInputRef.current?.value || '')
          }}
          className="absolute left-1/2 z-[60] flex h-11 w-[min(520px,calc(100vw-800px))] -translate-x-1/2 items-center gap-3 rounded-full bg-white/[0.07] px-4 text-slate-300 transition focus-within:bg-white/10"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={desktopSearchInputRef}
            type="search"
            name="q"
            autoComplete="off"
            aria-label={t('common.search')}
            placeholder={t('common.search')}
            onFocus={(event) => {
              setDesktopSearchQuery(event.currentTarget.value)
              setDesktopSearchFocused(true)
            }}
            onBlur={() => setDesktopSearchFocused(false)}
            onChange={(event) => {
              setDesktopSearchQuery(event.target.value)
              setDesktopSearchFocused(true)
              window.dispatchEvent(new CustomEvent('daet-search-input', {
                detail: { query: event.target.value },
              }))
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-slate-400 focus:ring-0"
          />
          {desktopSearchFocused && (
            <div className="desktop-search-suggestions absolute left-0 right-0 top-[calc(100%+0.65rem)] overflow-hidden rounded-2xl border p-2 shadow-xl" aria-label="Search suggestions">
              {matchingRecentSearches.length > 0 && (
                <>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">Recent searches</p>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearRecentSearches} className="desktop-search-reset text-[10px] font-bold transition">Reset</button>
                  </div>
                  {matchingRecentSearches.map((search) => (
                    <button
                      key={search}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectDesktopSearch(search)}
                      className="desktop-search-suggestion flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition"
                    >
                      <Search className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                      <span className="truncate">{search}</span>
                    </button>
                  ))}
                </>
              )}
              {desktopSearchQuery.trim().length >= 2 && (
                <div className="desktop-people-suggestions">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">People</p>
                  {suggestedUsers.map((user) => (
                    <UserProfileLink
                      key={user.id}
                      user={user}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setDesktopSearchFocused(false)}
                      className="desktop-search-suggestion flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm transition"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                        {user.profile_image_url
                          ? <img src={user.profile_image_url} alt="" className="h-full w-full object-cover" />
                          : <UserRound className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{user.full_name}</span>
                      <span className="shrink-0 text-[10px] opacity-60">Person</span>
                    </UserProfileLink>
                  ))}
                  {suggestedUsersLoading && <p className="px-3 py-2 text-xs opacity-60">Finding people…</p>}
                  {!suggestedUsersLoading && !suggestedUsers.length && <p className="px-3 py-2 text-xs opacity-60">No matching people found.</p>}
                </div>
              )}
              {desktopSearchQuery.trim() && !hasExactRecentSearch && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDesktopSearch(desktopSearchQuery)}
                  className="desktop-search-suggestion flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition"
                >
                  <Search className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                  <span className="truncate">Search for “{desktopSearchQuery.trim()}”</span>
                </button>
              )}
            </div>
          )}
        </Form>
        <div className="ml-auto flex shrink-0 items-center gap-5">
          <div className="relative" ref={desktopNotificationsRef}>
            <button
              type="button"
              onClick={() => setDesktopNotificationsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={desktopNotificationsOpen}
              aria-controls="desktop-notifications-popover"
              aria-label={unreadAlerts > 0
                ? `${t('common.notifications')}, ${unreadAlerts} unread`
                : t('common.notifications')}
              title={unreadAlerts > 0
                ? `${t('common.notifications')}, ${unreadAlerts} unread`
                : t('common.notifications')}
              className="usr-notification-trigger usr-press relative flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Bell className={`h-5 w-5 ${unreadAlerts > 0 ? 'text-sky-300' : ''}`} />
              {unreadAlerts > 0 && (
                <span className="usr-desktop-notification-count usr-badge absolute right-0 top-0 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#171717]">
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </button>
            {desktopNotificationsOpen && (
              <section
                id="desktop-notifications-popover"
                role="dialog"
                aria-label={t('common.notifications')}
                className="usr-pop-in absolute right-0 top-[calc(100%+1rem)] z-[70] w-[min(450px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-[#1d1d1d] text-slate-100 shadow-2xl"
              >
                <h2 className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-sm font-semibold text-slate-200">
                  <span>{t('common.notifications')}</span>
                  {unreadAlerts > 0 && (
                    <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold leading-none text-white">
                      {unreadAlerts > 99 ? '99+' : unreadAlerts} unread
                    </span>
                  )}
                </h2>
                <div aria-live="polite" className="max-h-[min(60vh,420px)] overflow-y-auto">
                  {desktopNotificationsLoading ? (
                    <div className="space-y-3 px-6 py-5" role="status">
                      <span className="sr-only">Loading notifications</span>
                      {[0, 1, 2].map((item) => (
                        <div key={item} className="flex items-center gap-3" aria-hidden="true">
                          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-3/4 animate-pulse rounded-full bg-white/10" />
                            <div className="h-3 w-1/2 animate-pulse rounded-full bg-white/10" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : desktopNotificationsError ? (
                    <div className="px-6 py-5 text-center text-sm text-red-300">
                      <p role="alert">{desktopNotificationsError}</p>
                      <button
                        type="button"
                        onClick={() => setDesktopNotificationsRefreshKey((key) => key + 1)}
                        className="mt-2 font-semibold underline underline-offset-2"
                      >
                        Try again
                      </button>
                    </div>
                  ) : desktopNotifications.length === 0 ? (
                    <p className="px-6 py-7 text-center text-sm text-slate-300">
                      You&apos;re all caught up.
                    </p>
                  ) : (
                    <ul>
                      {desktopNotifications.map((notification) => {
                        const actorName = notification.actor?.full_name || ''
                        const message = notification.message || notification.title || 'You have a new notification.'
                        const messageWithoutActor = actorName && message.toLowerCase().startsWith(actorName.toLowerCase())
                          ? message.slice(actorName.length).trim()
                          : message
                        const linkValue = notification.link || notification.action_url || notification.href
                        const legacyPath = typeof linkValue === 'string'
                          ? linkValue.replace(/^\/(admin|user)(?=\/|[?#]|$)/, '/info/$1')
                          : ''
                        const href = legacyPath.startsWith('/') && !legacyPath.startsWith('//')
                          ? legacyPath
                          : notification.post_id || notification.metadata?.post_id
                            ? `/info/user/posts/${encodeURIComponent(notification.post_id || notification.metadata.post_id)}`
                            : '/info/user/notifications'

                        return (
                          <li key={notification.id}>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!notification.is_read) {
                                  try {
                                    const response = await fetch('/info/api/notifications', {
                                      method: 'PATCH',
                                      credentials: 'same-origin',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: notification.id }),
                                    })
                                    const result = await response.json().catch(() => ({}))
                                    if (!response.ok || !result.success) {
                                      throw new Error(result.message || 'Unable to mark notification as read.')
                                    }
                                    setDesktopNotifications((previous) => previous.map((item) => (
                                      item.id === notification.id ? { ...item, is_read: true } : item
                                    )))
                                    setUnreadAlerts((count) => Math.max(0, count - 1))
                                    window.dispatchEvent(new CustomEvent('daet-notifications-updated', {
                                      detail: { unreadCount: Math.max(0, unreadAlerts - 1) },
                                    }))
                                  } catch (error) {
                                    console.error('Notification read update failed:', error)
                                    setDesktopNotificationsError('Could not update this notification. Please try again.')
                                    return
                                  }
                                }
                                setDesktopNotificationsOpen(false)
                                router.push(href)
                              }}
                              className={`desktop-notification-item flex w-full items-start gap-3 border-b border-white/10 px-5 py-4 text-left transition hover:bg-white/5 ${notification.is_read ? 'is-read text-slate-300' : 'is-unread bg-white/[0.04] text-white'}`}
                            >
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-semibold text-slate-100">
                                {notification.actor?.profile_image_url
                                  ? <img src={notification.actor.profile_image_url} alt="" className="h-full w-full object-cover" />
                                  : (actorName ? getInitials(actorName) : <Bell className="h-4 w-4" aria-hidden="true" />)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm leading-5">
                                  {actorName && <span className="desktop-notification-actor font-semibold text-white">{actorName} </span>}
                                  {messageWithoutActor}
                                </span>
                                {notification.created_at && (
                                  <time dateTime={notification.created_at} className="mt-1 block text-xs text-slate-400">
                                    {formatNotificationTime(notification.created_at)}
                                  </time>
                                )}
                              </span>
                              {!notification.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sky-400" aria-label="Unread" />}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                <Link
                  href="/info/user/notifications"
                  onClick={() => setDesktopNotificationsOpen(false)}
                  className="block border-t border-white/10 px-6 py-3 text-sm font-semibold text-slate-200 underline underline-offset-2 transition hover:bg-white/5 hover:text-white"
                >
                  See all notifications
                </Link>
              </section>
            )}
          </div>
          <div className="relative" ref={desktopProfileMenuRef}>
            <button
              type="button"
              onClick={() => setProfileMenuOpen((open) => !open)}
              aria-label={t('common.profile')}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              className="usr-press flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-slate-700 text-sm font-bold text-white transition hover:border-sky-300"
            >
              {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(identity.name)}
            </button>
            {profileMenuOpen && (
              <div role="menu" className="usr-pop-in absolute right-0 top-[calc(100%+0.65rem)] z-[70] w-[min(280px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1b1b1b] text-slate-200 shadow-2xl">
                <Link role="menuitem" href="/info/user/profile" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-3 border-b border-white/10 px-4 py-4 transition hover:bg-white/5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white">
                    {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(identity.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{identity.name || t('common.profile')}</span>
                    <span className="mt-1 block text-xs text-slate-400">{t('navigation.profile.view')}</span>
                  </span>
                </Link>
                <div className="border-b border-white/10 py-2">
                  <button
                    ref={appearanceTriggerRef}
                    role="menuitem"
                    type="button"
                    onClick={openAppearance}
                    aria-haspopup="dialog"
                    className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm transition hover:bg-white/5"
                  >
                    <Sparkles className="h-4 w-4 text-slate-400" />
                    <span className="flex-1">{t('settings.nav.appearance')}</span>
                  </button>
                  <Link role="menuitem" href="/info/user/settings" onClick={() => setProfileMenuOpen(false)} className="flex min-h-11 items-center gap-3 px-4 text-sm transition hover:bg-white/5">
                    <Settings className="h-4 w-4 text-slate-400" />
                    <span>{t('common.settings')}</span>
                  </Link>
                </div>
                <div className="p-2">
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false)
                      setShowLogoutConfirm(true)
                    }}
                    className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="h-4 w-4 text-slate-400" />
                    {t('common.logOut')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {!desktopOnly && <header className={`usr-fade-in fixed z-50 ${detailMode ? 'inset-x-0 top-0 content-detail-mobile-header px-2' : edgeToEdgeMobile ? 'inset-x-0 top-0 usr-mobile-header px-3 py-0' : 'inset-x-1 top-1 usr-mobile-header px-3 py-1'} lg:hidden`}>
        <div className={`mx-auto flex w-full max-w-none items-center gap-1 ${detailMode ? 'h-[88px] pl-1' : 'h-[90px]'}`}>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('daet-open-mobile-navigation'))}
            aria-label="Open navigation"
            className="usr-press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={homeHref} className="usr-press flex min-w-0 flex-1 items-center gap-2">
            <img src="/logo.png" alt="Daet tourism logo" className={`shrink-0 object-contain ${detailMode ? 'content-detail-brand-logo h-10 w-10' : 'h-9 w-9'}`} />
            <div className="min-w-0 flex-1">
              <strong className={`usr-mobile-header-brand-title truncate font-black tracking-tight ${detailMode ? 'text-xl' : 'text-sm sm:text-base'}`}>Connect-Daet.ai</strong>
              {!detailMode && <span className="usr-mobile-header-brand-subtitle line-clamp-2 block text-[9px] font-medium leading-[1.15] sm:text-[10px]">Subsystem 1: Daet Tourist Information, Engagement &amp; Management System</span>}
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-0.5">
            <Link href="/info/visitor/search" aria-label={t('common.search')} title={t('common.search')} className="usr-mobile-search-trigger usr-press flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-slate-100 dark:hover:bg-white/10">
              <Search className="h-4 w-4" />
            </Link>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-label={t('common.profile')}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                className={`usr-press flex items-center justify-center overflow-hidden rounded-full border border-slate-500 bg-slate-700 text-sm font-bold text-white transition hover:border-sky-300 ${detailMode ? 'h-11 w-11' : 'h-10 w-10'}`}
              >
                {identity.avatarUrl
                  ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : getInitials(identity.name)}
              </button>
              {profileMenuOpen && (
                <div role="menu" className="usr-pop-in absolute right-0 top-[calc(100%+0.65rem)] z-[70] w-[min(280px,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/10 bg-[#1b1b1b] text-slate-200 shadow-2xl">
                  <Link
                    role="menuitem"
                    href="/info/user/profile"
                    onClick={() => setProfileMenuOpen(false)}
                    className="flex items-center gap-3 border-b border-white/10 px-4 py-4 transition hover:bg-white/5"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-sm font-bold text-white">
                      {identity.avatarUrl
                        ? <img src={identity.avatarUrl} alt="" className="h-full w-full object-cover" />
                        : getInitials(identity.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{identity.name || t('common.profile')}</span>
                      <span className="mt-1 block text-xs text-slate-400">{t('navigation.profile.view')}</span>
                    </span>
                  </Link>
                  <div className="border-b border-white/10 py-2">
                    <Link role="menuitem" href="/info/user/notifications" onClick={() => setProfileMenuOpen(false)} className="flex min-h-11 items-center gap-3 px-4 text-sm transition hover:bg-white/5">
                      <Bell className={`h-4 w-4 ${unreadAlerts > 0 ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="flex-1">{t('common.notifications')}</span>
                      {unreadAlerts > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white">{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>}
                    </Link>
                    <button
                      ref={appearanceTriggerRef}
                      role="menuitem"
                      type="button"
                      onClick={openAppearance}
                      aria-haspopup="dialog"
                      className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm transition hover:bg-white/5"
                    >
                      <Sparkles className="h-4 w-4 text-slate-400" />
                      <span className="flex-1">{t('settings.nav.appearance')}</span>
                    </button>
                    <Link role="menuitem" href="/info/user/settings" onClick={() => setProfileMenuOpen(false)} className="flex min-h-11 items-center gap-3 px-4 text-sm transition hover:bg-white/5">
                      <Settings className="h-4 w-4 text-slate-400" />
                      <span>{t('common.settings')}</span>
                    </Link>
                  </div>
                  <div className="p-2">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        setShowLogoutConfirm(true)
                      }}
                      className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <LogOut className="h-4 w-4 text-slate-400" />
                      {t('common.logOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>}
      {!desktopOnly && spacer && <div aria-hidden="true" className={`user-top-header-spacer lg:h-16 ${detailMode ? 'h-[88px]' : 'h-[90px]'}`} />}
      {appearanceOpen && typeof document !== 'undefined' ? createPortal(
        <div className="settings-appearance-overlay">
          <div
            ref={appearanceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('settings.appearance.title')}
            className="usr-settings settings-appearance-dialog"
          >
            <AppearanceSection
              settings={appearanceDraft || settings}
              t={t}
              resolvedTheme={appearanceDraft?.theme === 'system' ? resolvedTheme : appearanceDraft?.theme || resolvedTheme}
              onThemeChange={(theme) => setAppearanceDraft((current) => ({ ...current, theme }))}
              onReduceMotionChange={(reduceMotion) => setAppearanceDraft((current) => ({ ...current, reduceMotion }))}
              onDone={applyAppearance}
              onClose={closeAppearance}
            />
          </div>
        </div>,
        document.body
      ) : null}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title={t('common.confirmLogout')}
        message={t('common.confirmLogoutMessage')}
        confirmText={loggingOut ? t('common.loggingOut') : t('common.logOut')}
        cancelText={t('common.cancel')}
        isDangerous
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  )
}
