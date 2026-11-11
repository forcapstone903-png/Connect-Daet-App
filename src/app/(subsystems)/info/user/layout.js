'use client'

import './user-sections.css'
import MobileNav from '@/app/(subsystems)/info/components/user/MobileNav'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { usePathname } from 'next/navigation'

export default function UserLayout({ children }) {
  const pathname = usePathname()
  const isConversationPage = /^\/info\/user\/messaging\/(?!archived(?:\/|$))[^/]+$/.test(pathname || '')
  const isAnnouncementDetailPage = /^\/info\/user\/announcements\/[^/]+$/.test(pathname || '')

  return (
    <>
      {!isConversationPage && !isAnnouncementDetailPage && <MobileNav />}
      <UserTopHeader
        desktopOnly
        homeHref="/info/user/dashboard"
        showDesktopNavigationToggle={!isConversationPage}
      />
      <div className={`user-page-shell min-h-screen ${isAnnouncementDetailPage ? 'pb-0 pt-0' : 'pb-[calc(76px+env(safe-area-inset-bottom))] pt-0'} lg:pb-0 lg:pt-16 ${isConversationPage ? '' : 'lg:pl-[302px]'}`}>{children}</div>
    </>
  )
}