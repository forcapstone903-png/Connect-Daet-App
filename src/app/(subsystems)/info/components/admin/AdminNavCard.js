// Destination card used by the admin hub overview pages (Community, Data,
// Notifications). Keeps icon, title, description, and call-to-action aligned.
import Link from 'next/link'
import { Icon } from '@/app/components/Icon'

export default function AdminNavCard({
  href,
  icon = 'data',
  title,
  description,
  actionLabel = 'Manage',
  meta,
  className = '',
}) {
  return (
    <Link href={href} className={`admin-nav-card ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <span className="admin-nav-card-icon">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        {meta}
      </div>

      <div>
        <h2 className="admin-nav-card-title">{title}</h2>
        {description ? <p className="admin-nav-card-text mt-1">{description}</p> : null}
      </div>

      <span className="admin-nav-card-link">
        {actionLabel}
        <Icon name="arrow" className="h-4 w-4" />
      </span>
    </Link>
  )
}