// Shared admin shell: session gate, navigation sidebar, and the console content
// column. Pages can let the shell resolve the session (no `user` prop) or pass
// an already-authenticated `user` when they need to load data before render.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar'
import AdminPageHeader from './AdminPageHeader'
import { getAdminHomePath, hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies'

export function AdminLoadingScreen({ label = 'Loading admin console…' }) {
  return (
    <div className="min-h-screen bg-gray-50" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--admin-sidebar-width)] border-r border-slate-200 bg-white p-5 lg:block" aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-200" />
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
            <div className="h-2 w-20 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-xl px-3 py-3">
              <div className="h-5 w-5 animate-pulse rounded-md bg-slate-200" />
              <div className="h-3 animate-pulse rounded-full bg-slate-100" style={{ width: `${80 + (item % 3) * 18}px` }} />
            </div>
          ))}
        </div>
      </aside>
      <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:ml-[var(--admin-sidebar-width)] lg:px-8" aria-hidden="true">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
          <div className="mt-4 h-7 w-2/3 max-w-md animate-pulse rounded-lg bg-slate-200" />
          <div className="mt-3 h-3 w-full max-w-2xl animate-pulse rounded-full bg-slate-100" />
          <div className="mt-2 h-3 w-4/5 max-w-xl animate-pulse rounded-full bg-slate-100" />
          <div className="mt-6 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        </header>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
          <div className="space-y-4">
            <div className="h-14 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            {[0, 1, 2].map((item) => (
              <article key={item} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-36 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-2.5 w-24 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
                </div>
                <div className="mt-5 h-3 w-full animate-pulse rounded-full bg-slate-100" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
                <div className="mt-5 h-24 animate-pulse rounded-xl bg-slate-100" />
              </article>
            ))}
          </div>
          <aside className="hidden space-y-4 xl:block">
            {[0, 1].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
                <div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100" />
                <div className="mt-3 h-3 w-3/4 animate-pulse rounded-full bg-slate-100" />
              </div>
            ))}
          </aside>
        </section>
      </main>
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
  headerClassName = '',
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
        router.replace('/info/login')
        return
      }

      try {
        const userData = JSON.parse(session)
        const role = userData.role || userData.user_type
        if (!hasAdminAccess(role)) {
          router.replace(getAdminHomePath(role))
          return
        }
        if (isActive) {
          setSessionUser(userData)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error loading admin session:', error)
        router.replace('/info/login')
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
        userRole={userRole ?? user?.role ?? user?.user_type ?? 'admin'}
        onLogout={onLogout}
      />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className={`admin-page ${contentClassName}`.trim()}>
        {hasHeader ? (
          <AdminPageHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            icon={headerIcon}
            className={headerClassName}
            actions={actions}
            meta={meta}
          />
        ) : null}

        {children != null ? <div className="admin-page-content">{children}</div> : null}
      </div>
    </div>
  )
}
