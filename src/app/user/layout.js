import MobileNav from '@/app/components/user/MobileNav'

export default function UserLayout({ children }) {
  return (
    <>
      <MobileNav />
      {/* Reserve space at the bottom for the fixed mobile navigation bar so
          content, buttons, and form actions are never hidden behind it. */}
      <div className="pb-20 lg:pb-0">{children}</div>
    </>
  )
}