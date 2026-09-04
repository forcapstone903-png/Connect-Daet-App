'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AdminSidebar from '@/app/components/AdminSidebar'
import { Icon } from '@/app/components/Icon'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

export default function ContentHubOverview() {
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
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    )
  }

  const contentItems = [
    {
      title: 'Attractions',
      description: 'Manage tourist spots, landmarks, and attractions',
      icon: 'attractions',
      href: '/admin/tourist-spots',
      color: 'from-sky-500 to-blue-600',
    },
    {
      title: 'Events',
      description: 'Create and manage events and activities',
      icon: 'events',
      href: '/admin/events',
      color: 'from-purple-500 to-pink-600',
    },
    {
      title: 'Amenities',
      description: 'Manage accommodations, restaurants, and services',
      icon: 'amenities',
      href: '/admin/amenities',
      color: 'from-emerald-500 to-green-600',
    },
    {
      title: 'Blogs & Articles',
      description: 'Write and publish blog posts and articles',
      icon: 'blog',
      href: '/admin/blogs',
      color: 'from-amber-500 to-orange-600',
    },
  ]

  return (
    <div className="flex h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Administrator" userRole={user?.role} />

      <main className="flex-1 overflow-auto">
        <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Content Management</h1>
            <p className="mt-2 text-slate-600">
              Manage all content including attractions, events, amenities, and blog posts
            </p>
          </div>

          {/* Quick Stats */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-sky-600">24</div>
              <p className="mt-2 text-sm text-slate-600">Active Attractions</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-purple-600">12</div>
              <p className="mt-2 text-sm text-slate-600">Upcoming Events</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-emerald-600">8</div>
              <p className="mt-2 text-sm text-slate-600">Amenities</p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow">
              <div className="text-3xl font-bold text-amber-600">18</div>
              <p className="mt-2 text-sm text-slate-600">Blog Posts</p>
            </div>
          </div>

          {/* Content Cards */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {contentItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-xl bg-white p-6 shadow transition-all hover:shadow-lg"
              >
                <div className={`inline-block rounded-lg bg-gradient-to-br ${item.color} p-4 text-white`}>
                  <Icon name={item.icon} className="w-8 h-8" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-sky-600">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                <div className="mt-4 flex items-center text-sm font-medium text-sky-600">
                  Manage <Icon name="arrow" className="inline-block w-4 h-4 ml-2" />
                </div>
              </Link>
            ))}
          </div>

          {/* Recent Activity */}
          <div className="mt-8">
            <h2 className="mb-4 text-xl font-bold text-slate-900">Recent Activity</h2>
            <div className="rounded-lg bg-white shadow">
              <div className="divide-y divide-slate-200">
                <div className="p-4 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">New event created</p>
                  <p className="text-xs text-slate-500">2 minutes ago</p>
                </div>
                <div className="p-4 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">Blog post published</p>
                  <p className="text-xs text-slate-500">1 hour ago</p>
                </div>
                <div className="p-4 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-900">Attraction updated</p>
                  <p className="text-xs text-slate-500">3 hours ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
