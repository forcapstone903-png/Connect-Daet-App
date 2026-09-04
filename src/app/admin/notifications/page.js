'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/app/components/AdminSidebar'
import { Icon } from '@/app/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

export default function NotificationsHubOverview() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getStoredSession()
    if (!session) {
      window.location.href = '/login'
      return
    }

    try {
      const userData = JSON.parse(session)
      if (!hasAdminAccess(userData.role)) {
        window.location.href = '/dashboard'
        return
      }
      setUser(userData)
    } catch (error) {
      console.error('Error loading session:', error)
      window.location.href = '/login'
    } finally {
      setLoading(false)
    }
  }, [])

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div></div>
  }

  const notificationItems = [
    { title: 'Send Announcement', description: 'Create and broadcast system announcements', icon: 'notifications', href: '/admin/notifications/send', color: 'from-blue-500 to-cyan-600' },
    { title: 'Scheduled', description: 'View and manage scheduled announcements', icon: 'analytics', href: '/admin/notifications/scheduled', color: 'from-amber-500 to-orange-600' },
    { title: 'History', description: 'View past announcements and delivery status', icon: 'data', href: '/admin/notifications/history', color: 'from-emerald-500 to-green-600' },
    { title: 'Emergency Alert', description: 'Send urgent alerts to all users', icon: 'warning', href: '/admin/notifications', color: 'from-red-500 to-pink-600' },
  ]

  return (
    <div className="flex h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />

      <main className="flex-1 overflow-auto">
        <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Notifications & Announcements</h1>
            <p className="mt-2 text-slate-600">Manage system announcements and alerts</p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-blue-600">5</div>
              <p className="mt-2 text-sm text-slate-600">Drafts</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-amber-600">3</div>
              <p className="mt-2 text-sm text-slate-600">Scheduled</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-green-600">28</div>
              <p className="mt-2 text-sm text-slate-600">Sent This Month</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-purple-600">94%</div>
              <p className="mt-2 text-sm text-slate-600">Delivery Rate</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {notificationItems.map((item) => (
              <Link key={item.href} href={item.href} className="group rounded-xl bg-white p-6 shadow transition-all hover:shadow-lg">
                <div className={`inline-block rounded-lg bg-gradient-to-br ${item.color} p-4 text-white`}>
                  <Icon name={item.icon} className="w-8 h-8" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-sky-600">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-sky-600">Manage <Icon name="arrow" className="inline-block w-4 h-4 ml-2" /></div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
