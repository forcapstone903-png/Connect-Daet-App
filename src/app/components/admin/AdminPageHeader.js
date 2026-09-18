// Shared admin page header: eyebrow, title, description, optional action area
// and meta row. Visual rules live in the "ADMIN CONSOLE DESIGN SYSTEM" block of
// src/app/globals.css, so light and dark mode stay in sync automatically.
import { Icon } from '@/app/components/Icon'

export default function AdminPageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  meta,
  className = '',
}) {
  return (
    <header className={`admin-page-header ${className}`.trim()}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="admin-header-icon">
            <Icon name={icon} className="h-5 w-5" />
          </span>
        ) : null}

        <div className="min-w-0">
          {eyebrow ? <p className="admin-eyebrow">{eyebrow}</p> : null}
          {title ? <h1>{title}</h1> : null}
          {description ? <p className="admin-subtitle">{description}</p> : null}
          {meta ? <div className="admin-header-meta">{meta}</div> : null}
        </div>
      </div>

      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  )
}
