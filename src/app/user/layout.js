'use client'

import MobileNav from '@/app/components/user/MobileNav'
import { usePathname } from 'next/navigation'

export default function UserLayout({ children }) {
  const pathname = usePathname()
  const isConversationPage = /^\/user\/messaging\/[^/]+$/.test(pathname || '')

  return (
    <>
      {!isConversationPage && <MobileNav />}
      {/* Reserve space at the bottom for the fixed mobile navigation bar so
          content, buttons, and form actions are never hidden behind it. */}
      <div className={isConversationPage ? 'min-h-screen' : 'pb-20 lg:pb-0'}>{children}</div>
    </>
  )
}