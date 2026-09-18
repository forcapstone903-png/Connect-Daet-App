'use client'

import {
  AdminButton,
  AdminNavCard,
  AdminPanel,
  AdminShell,
  AdminStatCard,
  AdminStatGrid,
} from '@/app/components/admin'
import useAdminMetrics, { countRows, resolveMetricEntries } from '@/lib/adminMetrics'

const DATA_DESTINATIONS = [
  {
    title: 'Media library',
    description: 'Browse uploaded images, videos, and documents with storage details.',
    icon: 'image',
    href: '/admin/file-management',
  },
  {
    title: 'Backups',
    description: 'Create, schedule, and restore database snapshots.',
    icon: 'save',
    href: '/admin/data?tab=backups',
  },
  {
    title: 'Import / Export',
    description: 'Move attractions and events in or out as CSV and JSON.',
    icon: 'data',
    href: '/admin/data-management',
  },
  {
    title: 'Data retention',
    description: 'Define how long visitor activity and records are kept.',
    icon: 'delete',
    href: '/admin/data?tab=retention',
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
      description="Backups, media, imports, and retention policy for the records that power the tourism platform."
      headerIcon="data"
      roleLabel="Administrator"
      loadingLabel="Loading data console…"
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
