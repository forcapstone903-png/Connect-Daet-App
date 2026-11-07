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

const COMMUNITY_DESTINATIONS = [
  {
    title: 'Forums',
    description: 'Moderate forum threads, replies, and reported discussions.',
    icon: 'forum',
    href: '/admin/forum',
  },
  {
    title: 'Feedback & complaints',
    description: 'Review visitor feedback and track resolution progress.',
    icon: 'feedback',
    href: '/admin/feedback',
  },
  {
    title: 'Users',
    description: 'Manage member accounts, roles, and account status.',
    icon: 'users',
    href: '/admin/users',
  },
  {
    title: 'Moderation queue',
    description: 'Work through pending approvals, flags, and safety reports.',
    icon: 'moderation',
    href: '/admin/moderation',
  },
]

// Module-scope loader keeps the metrics hook identity stable between renders.
const loadCommunityMetrics = () =>
  resolveMetricEntries([
    ['members', () => countRows('info_users')],
    ['activeMembers', () => countRows('info_users', { column: 'status', value: 'active' })],
    ['feedback', () => countRows('info_feedback')],
    ['inquiries', () => countRows('info_inquiries')],
  ])

export default function CommunityHubOverview() {
  const { metrics, loading, error, refresh } = useAdminMetrics('community', loadCommunityMetrics)

  return (
    <AdminShell
      eyebrow="Community"
      title="Community management"
      description="Forums, feedback, member accounts, and the moderation queue — everything that keeps the Daet tourism community healthy."
      headerIcon="community"
      roleLabel="Administrator"
      loadingLabel="Loading community console…"
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
          label="Members"
          value={metrics?.members}
          icon="users"
          tone="brand"
          loading={loading}
          meta="Registered accounts"
        />
        <AdminStatCard
          label="Active members"
          value={metrics?.activeMembers}
          icon="check"
          tone="success"
          loading={loading}
          meta="Status: active"
        />
        <AdminStatCard
          label="Feedback entries"
          value={metrics?.feedback}
          icon="feedback"
          tone="warning"
          loading={loading}
          meta="Ratings and comments"
        />
        <AdminStatCard
          label="Inquiries"
          value={metrics?.inquiries}
          icon="send"
          tone="info"
          loading={loading}
          meta="Forum and contact threads"
        />
      </AdminStatGrid>

      <AdminPanel
        title="Workspaces"
        description="Jump straight into a community workflow."
        padded={false}
        bodyClassName="p-4"
      >
        <div className="admin-nav-grid">
          {COMMUNITY_DESTINATIONS.map((destination) => (
            <AdminNavCard key={destination.href} {...destination} />
          ))}
        </div>
      </AdminPanel>
    </AdminShell>
  )
}

