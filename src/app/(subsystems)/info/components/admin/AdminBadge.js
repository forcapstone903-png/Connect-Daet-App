// Status badge with console tones. `toneForStatus` maps the status strings used
// across the admin tables (users, posts, inquiries, announcements, reports) to a
// consistent tone so the same state always looks the same.
const TONE_CLASSES = {
  neutral: 'admin-badge-neutral',
  brand: 'admin-badge-brand',
  info: 'admin-badge-info',
  success: 'admin-badge-success',
  warning: 'admin-badge-warning',
  danger: 'admin-badge-danger',
  violet: 'admin-badge-violet',
}

const STATUS_TONES = {
  active: 'success',
  approved: 'success',
  answered: 'success',
  resolved: 'success',
  published: 'success',
  completed: 'success',
  open: 'info',
  in_progress: 'info',
  'in progress': 'info',
  new: 'info',
  scheduled: 'info',
  pending: 'warning',
  review: 'warning',
  flagged: 'warning',
  draft: 'neutral',
  archived: 'neutral',
  closed: 'neutral',
  inactive: 'neutral',
  suspended: 'danger',
  rejected: 'danger',
  removed: 'danger',
  blocked: 'danger',
  critical: 'danger',
}

export function toneForStatus(status) {
  if (!status) return 'neutral'
  return STATUS_TONES[String(status).toLowerCase().replace(/-/g, '_')] || 'neutral'
}

export default function AdminBadge({ tone = 'neutral', status, dot = false, children, className = '' }) {
  const resolvedTone = status ? toneForStatus(status) : tone
  const label = children ?? (status ? String(status).replace(/[_-]/g, ' ') : '')

  return (
    <span className={`admin-badge ${TONE_CLASSES[resolvedTone] ?? TONE_CLASSES.neutral} ${className}`.trim()}>
      {dot ? <span className="admin-badge-dot" aria-hidden="true" /> : null}
      {label}
    </span>
  )
}