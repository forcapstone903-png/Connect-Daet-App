import MobileNav from '@/app/(subsystems)/info/components/user/MobileNav'
import UserTopHeader from '@/app/(subsystems)/info/components/user/UserTopHeader'

export default function VisitorLayout({ children }) {
  return (
    <>
      <MobileNav />
      <UserTopHeader desktopOnly homeHref="/info/visitor" />
      <div className="visitor-layout-content min-h-screen lg:pt-16 lg:pl-[302px]">
        {children}
      </div>
    </>
  )
}
