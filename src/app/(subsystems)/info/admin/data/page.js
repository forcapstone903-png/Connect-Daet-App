'use client'

import {
  AdminButton,
  AdminNavCard,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
} from '@/app/(subsystems)/info/components/admin'
import AdminTabRedirect from '@/app/(subsystems)/info/components/AdminTabRedirect'
import useAdminMetrics, { countRows, resolveMetricEntries } from '@/lib/adminMetrics'

const DATA_TABS = {
  backups: '/info/admin/data/backups',
  'import-export': '/info/admin/data/backups',
  media: '/info/admin/data/media',
  retention: '/info/admin/data/retention',
}

const DATA_DESTINATIONS = [
  {
    title: 'Media library',
    description: 'Manage tracked public-site images and videos stored in Supabase Storage.',
    icon: 'image',
    href: '/info/admin/file-management',
  },
  {
    title: 'Backup & restore',
    description: 'Create on-demand database snapshots and merge data from a saved file.',
    icon: 'save',
    href: '/info/admin/data/backups',
  },
  {
    title: 'Data retention',
    description: 'Review the current retention and deletion capabilities.',
    icon: 'delete',
    href: '/info/admin/data/retention',
  },
]

// Module-scope loader keeps the metrics hook identity stable between renders.
const loadDataMetrics = () =>
  resolveMetricEntries([
    ['attractions', () => countRows('info_tourist_spots')],
    ['events', () => countRows('info_events')],
    ['blogs', () => countRows('info_blogs')],
    ['userPosts', () => countRows('info_user_posts')],
  ])

export default function DataHubOverview() {
  const { metrics, loading, error, refresh } = useAdminMetrics('data', loadDataMetrics)

  return (
    <AdminShell
      eyebrow="Data"
      title="Data management"
      description="Database snapshots, media, and retention information for the records that power the tourism platform."
      headerIcon="data"
      roleLabel="Administrator"
      loadingLabel="Loading data console…"
      actions={
        <AdminButton icon="refresh" onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh metrics'}
        </AdminButton>
      }
    >
      <AdminTabRedirect routes={DATA_TABS} />
      {error ? (
        <AdminPanel className="mb-4">
          <p className="text-sm text-amber-700">{error}</p>
        </AdminPanel>
      ) : null}

      <AdminStatGrid>
        <AdminStatCard
          label="Tourist spots"
          value={metrics?.attractions}
          icon="attractions"
          tone="brand"
          loading={loading}
          meta="Destination records"
        />
        <AdminStatCard
          label="Events"
          value={metrics?.events}
          icon="events"
          tone="violet"
          loading={loading}
          meta="Event calendar entries"
        />
        <AdminStatCard
          label="Blog articles"
          value={metrics?.blogs}
          icon="blog"
          tone="info"
          loading={loading}
          meta="Editorial content"
        />
        <AdminStatCard
          label="Community posts"
          value={metrics?.userPosts}
          icon="community"
          tone="success"
          loading={loading}
          meta="User-generated content"
        />
      </AdminStatGrid>

      <AdminPanel
        title="Workspaces"
        description="Every dataset task in one place."
        padded={false}
        bodyClassName="p-4"
      >
        <div className="admin-nav-grid">
          {DATA_DESTINATIONS.map((destination) => (
            <AdminNavCard key={destination.href} {...destination} />
          ))}
        </div>
      </AdminPanel>
    </AdminShell>
  )
}
