'use client'

import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import VisitorDesktopNavigation from './VisitorDesktopNavigation'
import VisitorMobileHeader from './VisitorMobileHeader'
import { usePathname } from 'next/navigation'

export default function VisitorLayout({ children }) {
  const pathname = usePathname()
  const isVisitorHome = pathname === '/info/visitor' || pathname === '/info/visitor/'
  const isVisitorEventDetail = /^\/info\/visitor\/events\/[^/]+\/?$/.test(pathname)

  return (
    <>
      {!isVisitorHome && (
        <UserTopHeader
          desktopOnly
          homeHref="/info/visitor"
          showDesktopNavigationToggle={false}
          showDesktopMessages={isVisitorEventDetail}
        />
      )}
      {!isVisitorHome && (
        <>
          <VisitorDesktopNavigation />
          <VisitorMobileHeader />
        </>
      )}
      <div className={isVisitorHome
        ? 'visitor-home-content min-h-screen'
        : 'visitor-layout-content min-h-screen pb-[calc(60px+env(safe-area-inset-bottom))] lg:pb-0 lg:pt-16 lg:pl-[302px]'}>
        {children}
      </div>
    </>
  )
}
