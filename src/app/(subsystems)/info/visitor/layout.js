'use client'

import { usePathname } from 'next/navigation'
import VisitorNavbar from '@/app/(subsystems)/info/components/visitor/VisitorNavbar'
import VisitorFooter from '@/app/(subsystems)/info/components/visitor/VisitorFooter'

export default function VisitorLayout({ children }) {
  const pathname = usePathname()
  const isVisitorHome = pathname === '/info/visitor'

  if (isVisitorHome) {
    return <div className="visitor-home-content min-h-screen">{children}</div>
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f3f5f9] text-slate-900">
      <VisitorNavbar />
      <div className="visitor-layout-content flex-1 animate-in fade-in duration-300">
        {children}
      </div>
      <VisitorFooter />
    </div>
  )
}
