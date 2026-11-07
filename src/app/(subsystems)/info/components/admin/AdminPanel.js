// Admin content panel: bordered surface with an optional title bar, action
// slot, and footer stats row.
export default function AdminPanel({
  title,
  description,
  actions,
  footer,
  children,
  className = '',
  bodyClassName = '',
  padded = true,
  as: Tag = 'section',
}) {
  const hasHead = Boolean(title || description || actions)

  return (
    <Tag className={`admin-panel ${className}`.trim()}>
      {hasHead ? (
        <div className="admin-panel-head">
          <div className="min-w-0">
            {title ? <h2 className="admin-panel-title">{title}</h2> : null}
            {description ? <p className="admin-panel-desc">{description}</p> : null}
          </div>
          {actions ? <div className="admin-page-actions">{actions}</div> : null}
        </div>
      ) : null}

      <div className={`${padded ? 'admin-panel-body' : ''} ${bodyClassName}`.trim()}>{children}</div>

      {footer ? <div className="admin-panel-foot">{footer}</div> : null}
    </Tag>
  )
}
