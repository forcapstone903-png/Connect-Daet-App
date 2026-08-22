'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/app/components/AdminSidebar'
import { Icon } from '@/app/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'

export default function AccountHubOverview() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = sessionStorage.getItem('user_session')
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

  const accountItems = [
    { title: 'Profile', description: 'View and update your profile information', icon: 'profile', href: '/admin/account/profile', color: 'from-blue-500 to-cyan-600' },
    { title: 'Change Password', description: 'Update your account password', icon: 'settings', href: '/admin/account/password', color: 'from-amber-500 to-orange-600' },
    { title: '2FA Settings', description: 'Enable two-factor authentication', icon: 'settings', href: '/admin/account/2fa', color: 'from-emerald-500 to-green-600' },
    { title: 'Session Management', description: 'View and manage active sessions', icon: 'analytics', href: '/admin/account/sessions', color: 'from-purple-500 to-pink-600' },
  ]

  return (
    <div className="flex h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />

      <main className="flex-1 overflow-auto">
        <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">My Account</h1>
            <p className="mt-2 text-slate-600">Manage your profile and account settings</p>
          </div>

          <div className="mb-8 rounded-lg bg-white p-6 shadow">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-600 to-emerald-500 text-white">
                <Icon name="profile" className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">{user?.full_name || 'Administrator'}</h2>
                <p className="text-sm text-slate-600">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-lg font-bold text-slate-900">Administrator</div>
              <p className="mt-2 text-sm text-slate-600">Account Role</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-lg font-bold text-green-600 flex items-center gap-2"><Icon name="check" className="w-5 h-5" />Active</div>
              <p className="mt-2 text-sm text-slate-600">Status</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-lg font-bold text-amber-600">Enabled</div>
              <p className="mt-2 text-sm text-slate-600">2FA Status</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-lg font-bold text-blue-600">1 active</div>
              <p className="mt-2 text-sm text-slate-600">Sessions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {accountItems.map((item) => (
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
