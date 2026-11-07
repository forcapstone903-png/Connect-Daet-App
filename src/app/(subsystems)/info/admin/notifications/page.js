'use client'

import {
  AdminButton,
  AdminNavCard,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
} from '@/app/components/admin'
import useAdminMetrics from '@/lib/adminMetrics'
import { supabase } from '@/lib/supabase'

const NOTIFICATION_DESTINATIONS = [
  {
    title: 'Send announcement',
    description: 'Compose and broadcast a notice to the chosen audience.',
    icon: 'notifications',
    href: '/admin/announcement',
  },
  {
    title: 'Scheduled & templates',
    description: 'Manage categories, templates, quiet hours, and emergency protocol.',
    icon: 'calendar',
    href: '/admin/announcement-settings',
  },
  {
    title: 'Delivery history',
    description: 'Audit previously published and archived announcements.',
    icon: 'data',
    href: '/admin/announcement?tab=history',
  },
]

// Announcement metrics need per-row status and reach, so one small projection
// is fetched and reduced client-side (the admin list already loads in full).
const loadAnnouncementMetrics = async () => {
  const { data, error } = await supabase
    .from('info_announcements')
    .select('id, status, view_count')

  if (error) throw error

  const rows = data || []
  const countStatus = (status) => rows.filter((row) => row.status === status).length

  return {
    total: rows.length,
    published: countStatus('published'),
    drafts: countStatus('draft'),
    views: rows.reduce((sum, row) => sum + Number(row.view_count || 0), 0),
  }
}

export default function NotificationsHubOverview() {
  const { metrics, loading, error, refresh } = useAdminMetrics('notifications', loadAnnouncementMetrics)

  return (
    <AdminShell
      eyebrow="Notifications"
      title="Notifications & announcements"
      description="Plan, schedule, and audit every public notice and emergency alert issued from the admin console."
      headerIcon="notifications"
      roleLabel="Administrator"
      loadingLabel="Loading announcements console…"
      actions={
        <AdminButton icon="refresh" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh metrics'}
        </AdminButton>
      }
    >
      {error ? (
        <AdminPanel className="mb-4">
          <p className="text-sm text-amber-700">{error}</p>
        </AdminPanel>
      ) : null}

      <AdminStatGrid>
        <AdminStatCard
          label="All announcements"
          value={metrics?.total}
          icon="notifications"
          tone="brand"
          loading={loading}
          meta="Drafts, published, archived"
        />
        <AdminStatCard
          label="Published"
          value={metrics?.published}
          icon="check"
          tone="success"
          loading={loading}
          meta="Currently visible"
        />
        <AdminStatCard
          label="Drafts"
          value={metrics?.drafts}
          icon="edit"
          tone="warning"
          loading={loading}
          meta="Awaiting review"
        />
        <AdminStatCard
          label="Total views"
          value={metrics?.views}
          icon="eye"
          tone="info"
          loading={loading}
          meta="Recorded impressions"
        />
      </AdminStatGrid>

      <AdminPanel
        title="Workspaces"
        description="Publish once — reach visitors on the website and in the app."
        padded={false}
        bodyClassName="p-4"
      >
        <div className="admin-nav-grid">
          {NOTIFICATION_DESTINATIONS.map((destination) => (
            <AdminNavCard key={destination.href} {...destination} />
          ))}
        </div>
      </AdminPanel>
    </AdminShell>
  )
}
