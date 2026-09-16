'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Bookmark, LogOut, Menu, MessageCircle, Search, Settings, UserRound } from 'lucide-react'
import { performLogout } from '@/lib/clientLogout'
import ConfirmationModal from '@/app/components/ConfirmationModal'

export default function UserTopHeader() {
  const [showMenu, setShowMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [unreadAlerts, setUnreadAlerts] = useState(0)

  useEffect(() => {
    let active = true

    const loadUnreadAlerts = async () => {
      try {
        const response = await fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' })
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
    return () => {
      active = false
      window.removeEventListener('daet-notifications-updated', handleUpdate)
    }
  }, [])

  const handleLogout = () => {
    setShowMenu(false)
    setShowLogoutConfirm(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    await performLogout()
    window.location.assign('/login')
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link href="/user/dashboard" className="flex min-w-0 shrink-0 items-center gap-2">
            <img src="/logo.png" alt="Daet tourism logo" className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-black tracking-tight text-sky-700 sm:text-base">Daet Connect</span>
              <span className="block truncate text-[10px] font-medium text-slate-500 sm:text-xs">Daet community</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <Link href="/search" aria-label="Search" title="Search" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-sky-700">
              <Search className="h-4 w-4" />
            </Link>
            <Link href="/user/notifications" aria-label="Notifications" title="Notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-sky-700">
              <Bell className="h-4 w-4" />
              {unreadAlerts > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">{unreadAlerts > 9 ? '9+' : unreadAlerts}</span>}
            </Link>
            <div className="relative">
              <button type="button" onClick={() => setShowMenu((value) => !value)} aria-expanded={showMenu} aria-label="Open settings menu" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-sky-50 hover:text-sky-700">
                <Menu className="h-5 w-5" />
              </button>
              {showMenu && <div className="absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <Link href="/user/profile" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" />Profile</Link>
                <Link href="/user/settings" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" />Settings</Link>
                <Link href="/user/messaging" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle className="h-4 w-4" />Messages</Link>
                <Link href="/user/saved" onClick={() => setShowMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Bookmark className="h-4 w-4" />Saved</Link>
                <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Log out</button>
              </div>}
            </div>
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="h-[66px] lg:hidden" />
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title="Confirm Logout"
        message="Are you sure you want to logout?"
        confirmText={loggingOut ? 'Logging out...' : 'OK'}
        cancelText="Cancel"
        isDangerous
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  )
}
