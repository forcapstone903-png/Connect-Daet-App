// Consistent empty / no-results state for admin tables, lists, and panels.
import { Icon } from '@/app/components/Icon'

export default function AdminEmptyState({
  icon = 'data',
  title = 'Nothing here yet',
  description,
  action,
  className = '',
}) {
  return (
    <div className={`admin-empty ${className}`.trim()}>
      <span className="admin-empty-icon">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="admin-empty-title">{title}</p>
      {description ? <p className="admin-empty-text">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}