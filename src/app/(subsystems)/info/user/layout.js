'use client'

import './user-sections.css'
import MobileNav from '@/app/(subsystems)/info/components/user/MobileNav'
import { usePathname } from 'next/navigation'

export default function UserLayout({ children }) {
  const pathname = usePathname()
  const isConversationPage = /^\/info\/user\/messaging\/(?!archived(?:\/|$))[^/]+$/.test(pathname || '')

  return (
    <>
      {!isConversationPage && <MobileNav />}
      <div className={`user-page-shell ${isConversationPage ? 'min-h-screen' : 'pt-16 lg:pt-0'}`}>{children}</div>
    </>
  )
}