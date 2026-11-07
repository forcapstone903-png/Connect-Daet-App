// Admin stat tiles. Values can be numbers, formatted strings, or omitted while
// loading (a subtle skeleton is shown instead of a misleading zero).
import Link from 'next/link'
import { Icon } from '@/app/components/Icon'

export default function AdminStatCard({
  label,
  value,
  meta,
  icon,
  tone = 'brand',
  href,
  loading = false,
  className = '',
}) {
  const hasValue = value !== null && value !== undefined && value !== ''
  const showSkeleton = loading && !hasValue

  const content = (
    <>
      <span className="admin-stat-accent" aria-hidden="true" />
      <div className="admin-stat-head">
        <p className="admin-stat-label">{label}</p>
        {icon ? (
          <span className="admin-stat-icon">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {showSkeleton ? (
        <span className="admin-stat-skeleton" aria-hidden="true" />
      ) : (
        <p className="admin-stat-value">{hasValue ? value : '—'}</p>
      )}
      {meta ? <p className="admin-stat-meta">{meta}</p> : null}
    </>
  )

  if (href) {
    return (
      <Link href={href} data-tone={tone} className={`admin-stat admin-stat-link ${className}`.trim()}>
        {content}
      </Link>
    )
  }

  return (
    <div data-tone={tone} className={`admin-stat ${className}`.trim()}>
      {content}
    </div>
  )
}

export function AdminStatGrid({ children, columns, className = '' }) {
  return (
    <div
      className={`admin-stat-grid ${className}`.trim()}
      data-columns={columns ? String(columns) : undefined}
    >
      {children}
    </div>
  )
}
