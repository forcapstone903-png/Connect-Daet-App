'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Bookmark, LogOut, Menu, MessageCircle, Search, Settings, UserRound } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/(subsystems)/info/components/ConfirmationModal'
import { useUserSettings } from '@/components/UserSettingsProvider'

export default function UserTopHeader() {
  const { t } = useUserSettings()
  const [showMenu, setShowMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)

  useEffect(() => {
    let active = true

    const loadUnreadAlerts = async () => {
      try {
        const response = await fetch('/info/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
        const result = response.ok ? await response.json() : null
        if (active && result?.success) {
          const unreadCount = Number.isFinite(Number(result.unread_count))
            ? Number(result.unread_count)
            : (result.notifications || []).filter((notification) => !notification.is_read).length
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
    }
    window.addEventListener('daet-notifications-updated', handleUpdate)
    // MobileNav owns the polling loop for both counts on the user shell, so reuse
    // its values here instead of hitting /info/api/notifications twice.
    const handleSharedCounts = (event) => {
      const alerts = Number(event?.detail?.unreadAlerts)
      const messages = Number(event?.detail?.unreadMessages)
      if (Number.isFinite(alerts)) setUnreadAlerts(alerts)
      if (Number.isFinite(messages)) setUnreadMessages(messages)
    }
    window.addEventListener('daet-unread-counts', handleSharedCounts)
    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', handleUpdate)
      window.removeEventListener('daet-unread-counts', handleSharedCounts)
    }
  }, [])

  const handleLogout = () => {
    setShowMenu(false)
    setShowLogoutConfirm(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    await performLogout()
    window.location.assign('/info/login')
  }

  return (
    <>
      <header className="usr-fade-in fixed inset-x-0 top-0 z-50 border-b border-slate-700 bg-[#111d2e] px-2 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.18)] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Link href="/info/user/dashboard" className="usr-press flex min-w-0 flex-1 items-center gap-2">
            <img src="/logo.png" alt="Daet tourism logo" className="h-9 w-9 shrink-0 object-contain" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-slate-100 sm:text-base">Connect-Daet.ai</span>
              <span className="line-clamp-2 block text-[9px] font-medium leading-[1.15] text-slate-300 sm:text-[10px]">Subsystem 1: Daet Information, Engagement, &amp; Management System</span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-0.5">
            <Link href="/info/visitor/search" aria-label={t('common.search')} title={t('common.search')} className="usr-press flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white">
              <Search className="h-4 w-4" />
            </Link>
            <Link href="/info/user/notifications" aria-label={t('common.notifications')} title={t('common.notifications')} className="usr-press relative flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white">
              <Bell className={`h-4 w-4 ${unreadAlerts > 0 ? 'text-sky-300' : ''}`} />
              {unreadAlerts > 0 && <span className="usr-badge absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>}
            </Link>
            <div className="relative">
              <button type="button" onClick={() => setShowMenu((value) => !value)} aria-expanded={showMenu} aria-label="Open settings menu" className="usr-press flex h-9 w-9 items-center justify-center rounded-xl border border-slate-600 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white">
                <Menu className="h-5 w-5" />
              </button>
              {showMenu && <div className="usr-pop-in absolute right-0 top-12 z-30 w-48 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <Link href="/info/user/profile" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" />{t('common.profile')}</Link>
                <Link href="/info/user/settings" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />{t('common.settings')}</Link>
                <Link href="/info/user/messaging" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle className="h-4 w-4" />{t('common.messages')}</Link>
                <Link href="/info/user/saved" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Bookmark className="h-4 w-4" />{t('common.saved')}</Link>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />{t('common.logOut')}</button>
              </div>}
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="h-[64px] lg:hidden" />
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
    </>
  )
}
