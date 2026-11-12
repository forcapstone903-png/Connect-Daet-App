'use client'

import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'
import { usePathname } from 'next/navigation'

export default function VisitorLayout({ children }) {
  const pathname = usePathname()
  const isVisitorHome = pathname === '/info/visitor'

  return (
    <>
      {!isVisitorHome && <UserTopHeader desktopOnly homeHref="/info/visitor" />}
      <div className={isVisitorHome
        ? 'visitor-home-content min-h-screen'
        : 'visitor-layout-content min-h-screen lg:pt-16 lg:pl-[302px]'}>
        {children}
      </div>
    </>
  )
}
