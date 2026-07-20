'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Manage Users', icon: '👥' },
  { href: '/admin/events', label: 'Events & Activities', icon: '📅' },
  { href: '/admin/moderation', label: 'Moderation', icon: '⏳' },
  { href: '/admin/announcement', label: 'Announcement', icon: '📢' },
  { href: '/admin/tourist-spots', label: 'Tourist Spots', icon: '🗺️' },
  { href: '/admin/blog', label: 'Blog & News', icon: '📝' },
  { href: '/admin/amenities', label: 'Amenities', icon: '🏨' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
]

export default function AdminSidebar({ user, roleLabel = 'System Administrator', onLogout }) {
  const pathname = usePathname()
  const router = useRouter()

  const isActive = (href) => pathname === href || pathname.startsWith(`${href}/`)

  const handleLogout = async () => {
    sessionStorage.removeItem('user_session')
    if (onLogout) {
      await onLogout()
      return
    }
    router.push('/login')
  }

  return (
    <div className="fixed left-0 top-0 z-20 flex h-full w-64 flex-col border-r border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
            <span className="text-xl">🗺️</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wide text-gray-800">DAET·TOURISM</h1>
            <p className="text-xs text-gray-500">Administrator Console</p>
          </div>
        </div>
        <div className="mt-4 pt-2">
          <p className="flex items-center gap-1 text-sm font-medium text-gray-700">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {user?.full_name || user?.user_name || user?.email || 'Admin User'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{roleLabel}</p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={`font-medium ${active ? 'text-blue-700' : 'text-gray-700'}`}>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-red-50 px-3 py-2.5 text-red-700 transition-all duration-200 hover:bg-red-100"
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}
