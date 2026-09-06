import MobileNav from '@/app/components/user/MobileNav'

export default function UserLayout({ children }) {
  return (
    <>
      <MobileNav />
      {children}
    </>
  )
}