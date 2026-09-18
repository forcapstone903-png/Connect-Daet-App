'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Bookmark, CalendarDays, FileText, Home, LogOut, Menu, MessageCircle, PlusCircle, Search, Settings, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getStoredSessionObject } from '@/lib/authCookies'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/components/ConfirmationModal'
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
  { href: '/user/dashboard', labelKey: 'common.feed', icon: Home },
  { href: '/user/forums', labelKey: 'common.forums', icon: MessageCircle },
  { href: '/user/blogs/new', labelKey: 'common.create', icon: PlusCircle, highlight: true },
  { href: '/user/blogs', labelKey: 'common.blogs', icon: FileText },
  { href: '/user/events', labelKey: 'common.events', icon: CalendarDays },
]

const desktopNavItems = [
  { href: '/user/dashboard', labelKey: 'common.feed', icon: Home },
  { href: '/user/forums', labelKey: 'common.forums', icon: MessageCircle },
  { href: '/user/blogs', labelKey: 'common.blogs', icon: FileText },
  { href: '/user/events', labelKey: 'common.events', icon: CalendarDays },
  { href: '/user/saved', labelKey: 'common.saved', icon: Bookmark },
  { href: '/user/settings', labelKey: 'common.settings', icon: Settings },
]

export default function MobileNav() {
  const { t } = useUserSettings()
  const pathname = usePathname()
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)
  const [userName, setUserName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    const handleCommentsSheetState = (event) => setCommentsSheetOpen(Boolean(event.detail?.open))
    window.addEventListener('daet-comments-sheet-state', handleCommentsSheetState)
    return () => window.removeEventListener('daet-comments-sheet-state', handleCommentsSheetState)
  }, [])

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
    const userId = readStoredUserId()
    if (!userId || !supabase) return undefined

    let active = true
    const loadProfile = async () => {
      try {
        const { data } = await supabase.from('info_users').select('full_name, profile_image_url').eq('id', userId).maybeSingle()
        if (!active) return
        if (data?.full_name?.trim()) setUserName(data.full_name.trim())
        if (data?.profile_image_url) setUserAvatarUrl(data.profile_image_url)
      } catch {
        // Keep session-derived identity when the profile lookup fails.
      }
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const session = getStoredSessionObject()
    const userId = session?.user_id || session?.id || session?.userId || session?.sub || ''

    const loadUnreadAlerts = async () => {
      try {
        const [notificationsResponse, messagesResponse] = await Promise.all([
          fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' }),
          fetch('/api/messages', { credentials: 'same-origin', cache: 'no-store' }),
        ])
        const notificationsResult = notificationsResponse.ok ? await notificationsResponse.json() : null
        const messagesResult = messagesResponse.ok ? await messagesResponse.json() : null
        if (active && notificationsResult?.success) {
          const unreadCount = Number.isFinite(Number(notificationsResult.unread_count))
            ? Number(notificationsResult.unread_count)
            : (notificationsResult.notifications || []).filter((notification) => !notification.is_read).length
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

  const openLogoutConfirm = () => {
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
      window.location.assign('/login')
    }
  }

  return (
    <>
      <nav className="sticky top-0 z-40 hidden border-b border-[#dfe7e1] bg-[#fffefa]/95 shadow-[0_6px_20px_rgba(29,42,39,0.04)] backdrop-blur-sm lg:block">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Link href="/user/dashboard" className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <img src="/logo.png" alt="Daet tourism logo" className="h-9 w-9 object-contain" />
              <span className="flex flex-col leading-none">
                <span className="text-sm font-black tracking-tight text-slate-900">CONNECT-Daet</span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Camarines Norte</span>
              </span>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-1 whitespace-nowrap">
            {desktopNavItems.map(({ href, labelKey, icon: Icon }) => {
              const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
              return <Link key={href} href={href} aria-current={isActive ? 'page' : undefined} className={`usr-press relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${isActive ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{t(labelKey)}{isActive && <span aria-hidden="true" className="usr-pop-in absolute inset-x-2 -bottom-[1px] h-0.5 rounded-full bg-sky-600" />}</Link>
            })}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <Link href="/search" aria-label={t('common.search')} title={t('common.search')} className="usr-press rounded-lg p-2 text-slate-600 hover:bg-slate-50">
              <Search className="h-5 w-5" />
            </Link>
            <Link href="/user/notifications" aria-label={t('common.notifications')} title={t('common.notifications')} className="usr-press relative rounded-lg p-2 text-slate-600 hover:bg-slate-50">
              <Bell className="h-5 w-5" />
              {unreadAlerts > 0 && (
                <span className="usr-badge absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#fffefa]">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>
              )}
            </Link>
            <Link href="/user/messaging" aria-label={t('common.messages')} title={t('common.messages')} className="usr-press relative rounded-lg p-2 text-slate-600 hover:bg-slate-50">
              <MessageCircle className="h-5 w-5" />
              {unreadMessages > 0 && (
                <span className="usr-badge absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#fffefa]">{unreadMessages > 9 ? '9+' : unreadMessages}</span>
              )}
            </Link>
            <div className="relative" ref={profileMenuRef}>
              <button type="button" onClick={() => setShowProfileMenu((open) => !open)} aria-haspopup="menu" aria-expanded={showProfileMenu} aria-label="Account menu" title="Account" className="usr-press flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-0.5 pr-2 text-slate-600 transition hover:border-sky-300 hover:text-sky-700">
                <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                  {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : (userName ? getInitials(userName) : <UserRound className="h-4 w-4" aria-hidden="true" />)}
                </span>
                <Menu className="h-4 w-4" aria-hidden="true" />
              </button>
              {showProfileMenu && (
                <div role="menu" className="usr-pop-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 origin-top-right overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <Link role="menuitem" href="/user/profile" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" aria-hidden="true" />{t('common.profile')}</Link>
                  <Link role="menuitem" href="/user/settings" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" aria-hidden="true" />{t('common.settings')}</Link>
                  <Link role="menuitem" href="/user/messaging" onClick={() => setShowProfileMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle className="h-4 w-4" aria-hidden="true" />{t('common.messages')}</Link>
                  <div className="my-1 border-t border-slate-100" role="separator" />
                  <button role="menuitem" type="button" onClick={openLogoutConfirm} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" aria-hidden="true" />{t('common.logOut')}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
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
      {!commentsSheetOpen && <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#dfe7e1] bg-[#fffefa]/96 shadow-[0_-8px_24px_rgba(29,42,39,0.08)] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-sm lg:hidden">
        <div className="mx-auto grid max-w-[520px] grid-cols-5 items-center gap-1 px-2 py-1.5">
          {navItems.map(({ href, labelKey, icon: Icon, highlight }) => {
            const isActive = pathname === href || (href !== '/user/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`usr-press flex h-14 min-w-0 flex-col items-center justify-center rounded-lg px-1 text-center transition ${
                    highlight ? 'text-white' : isActive ? 'text-[#16766f]' : 'text-[#72807a] hover:bg-[#edf4f0] hover:text-[#0e514d]'
                }`}
              >
                {highlight ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#16766f] shadow-[0_6px_14px_rgba(22,118,111,0.25)]">
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <span className="relative flex items-center justify-center">
                    {isActive && <span aria-hidden="true" className="usr-pop-in absolute -top-2.5 h-1 w-5 rounded-full bg-[#16766f]" />}
                    <Icon className={`h-5 w-5 ${isActive ? 'fill-sky-100' : ''}`} />
                  </span>
                )}
                <span className={`mt-1 block text-[10px] font-semibold leading-none ${!highlight && isActive ? 'text-sky-700' : highlight ? 'text-sky-600' : ''}`}>
                  {t(labelKey)}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>}
    </>
  )
}