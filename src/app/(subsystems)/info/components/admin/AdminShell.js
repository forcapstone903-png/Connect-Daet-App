// Shared admin shell: session gate, navigation sidebar, and the console content
// column. Pages can let the shell resolve the session (no `user` prop) or pass
// an already-authenticated `user` when they need to load data before render.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from '@/app/components/AdminSidebar'
import AdminPageHeader from './AdminPageHeader'
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

export function AdminLoadingScreen({ label = 'Loading admin console…' }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="admin-loading">
        <span className="admin-loading-ring" aria-hidden="true" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  )
}

export default function AdminShell({
  user: providedUser,
  roleLabel = 'Administrator',
  userRole,
  onLogout,
  title,
  eyebrow,
  description,
  headerIcon,
  actions,
  meta,
  children,
  loadingLabel = 'Loading admin console…',
  contentClassName = '',
}) {
  const router = useRouter()
  const [sessionUser, setSessionUser] = useState(null)
  const [loading, setLoading] = useState(providedUser === undefined)

  // Pages that already resolved the session pass it in and skip the gate.
  const user = providedUser !== undefined ? providedUser : sessionUser

  useEffect(() => {
    if (providedUser !== undefined) return undefined

    let isActive = true

    const loadSession = () => {
      const session = getStoredSession()
      if (!session) {
        router.replace('/login')
        return
      }

      try {
        const userData = JSON.parse(session)
        if (!hasAdminAccess(userData.role)) {
          router.replace('/admin/dashboard')
          return
        }
        if (isActive) {
          setSessionUser(userData)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error loading admin session:', error)
        router.replace('/login')
      }
    }

    loadSession()

    return () => {
      isActive = false
    }
  }, [providedUser, router])

  if (loading) return <AdminLoadingScreen label={loadingLabel} />

  const hasHeader = Boolean(title || eyebrow || description || actions)

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar
        user={user}
        roleLabel={roleLabel}
        userRole={userRole ?? user?.role ?? 'admin'}
        onLogout={onLogout}
      />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className={`admin-page ${contentClassName}`.trim()}>
        {hasHeader ? (
          <AdminPageHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            icon={headerIcon}
            actions={actions}
            meta={meta}
          />
        ) : null}

        {children}
      </div>
    </div>
  )
}
