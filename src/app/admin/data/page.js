'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/app/components/AdminSidebar'
import { Icon } from '@/app/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

export default function DataHubOverview() {
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
        window.location.href = '/admin/dashboard'
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

  const dataItems = [
    { title: 'Media Library', description: 'Manage images, videos, and files', icon: 'data', href: '/admin/data/media', color: 'from-blue-500 to-cyan-600' },
    { title: 'Backups', description: 'Schedule and restore database backups', icon: 'save', href: '/admin/data/backups', color: 'from-green-500 to-emerald-600' },
    { title: 'Import / Export', description: 'Import CSV/JSON data or export reports', icon: 'arrow', href: '/admin/data/import-export', color: 'from-purple-500 to-pink-600' },
    { title: 'Data Retention', description: 'Manage data deletion and retention policies', icon: 'delete', href: '/admin/data/retention', color: 'from-red-500 to-orange-600' },
  ]

  return (
    <div className="flex h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />

      <main className="flex-1 overflow-auto">
        <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Data Management</h1>
            <p className="mt-2 text-slate-600">Manage backups, media, imports, and data retention</p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-blue-600">4.2GB</div>
              <p className="mt-2 text-sm text-slate-600">Total Storage</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-green-600">2.1GB</div>
              <p className="mt-2 text-sm text-slate-600">Used Storage</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-amber-600">Yesterday</div>
              <p className="mt-2 text-sm text-slate-600">Last Backup</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-purple-600">1,240</div>
              <p className="mt-2 text-sm text-slate-600">Media Files</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {dataItems.map((item) => (
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
