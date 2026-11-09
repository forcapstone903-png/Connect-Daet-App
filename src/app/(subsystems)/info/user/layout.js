'use client'

import './user-sections.css'
import MobileNav from '@/app/(subsystems)/info/components/user/MobileNav'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { usePathname } from 'next/navigation'

export default function UserLayout({ children }) {
  const pathname = usePathname()
  const isDashboardPage = pathname === '/info/user/dashboard'
  const isNotificationsPage = pathname === '/info/user/notifications'
  const isConversationPage = /^\/info\/user\/messaging\/(?!archived(?:\/|$))[^/]+$/.test(pathname || '')
  const shellTopSpacing = isDashboardPage || isNotificationsPage ? 'pt-0' : 'pt-16'

  return (
    <>
      {!isConversationPage && <MobileNav />}
      <UserTopHeader
        desktopOnly
        homeHref="/info/user/dashboard"
        showDesktopNavigationToggle={!isConversationPage}
      />
      <div className={`user-page-shell ${isConversationPage ? 'min-h-screen lg:pt-16' : `min-h-screen ${shellTopSpacing} lg:pt-16 lg:pl-[302px]`}`}>{children}</div>
    </>
  )
}