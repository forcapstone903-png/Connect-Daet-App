import Link from 'next/link'

export default function UserSectionHeader({
  eyebrow,
  title,
  description,
  emoji,
  backHref,
  backLabel,
  children,
}) {
  return (
    <header className="usr-section-heading usr-card usr-enter">
      <div className="usr-section-heading-row">
        <div className="min-w-0 flex-1">
          <p className="usr-section-eyebrow">{eyebrow}</p>
          <h1 className="usr-section-title">{title} {emoji && <span className="usr-wave inline-block" aria-hidden="true">{emoji}</span>}</h1>
          <p className="usr-section-description">{description}</p>
        </div>
        {children && <div className="usr-section-heading-actions">{children}</div>}
      </div>
    </header>
  )
}

export function SectionLoading({ label = 'Loading content' }) {
  return (
    <div role="status" aria-live="polite" className="usr-section-loading">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5" aria-hidden="true">
          <div className="usr-section-skeleton h-12 w-12 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <div className="usr-section-skeleton h-3 w-2/5 rounded-full" />
            <div className="usr-section-skeleton h-3 w-4/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Segmented tab strip shared by the user section pages. Keeps the dashboard's
 * pill language (usr-tab) without depending on the dashboard-only shell.
 */
export function SectionTabs({ label, value, onChange, options, children }) {
  return (
    <div className="usr-section-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className="usr-section-tab usr-press"
        >
          {option.icon ? <option.icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
          <span>{option.label}</span>
          {typeof option.count === 'number' ? <span className="usr-section-tab-count">{option.count}</span> : null}
        </button>
      ))}
      {children}
    </div>
  )
}

/**
 * Stat tiles used on the profile, rewards, and feedback summaries.
 * Pass `href` to make a tile a real link (for example followers/following).
 */
export function SectionStats({ items, className = '' }) {
  return (
    <div className={`usr-stat-grid ${className}`.trim()}>
      {items.map(({ label, value, icon: Icon, tone, href, hint }) => {
        const content = (
          <>
            <div className="min-w-0">
              <p className="usr-stat-label">{label}</p>
              <p className="usr-stat-value">{value}</p>
              {hint ? <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p> : null}
            </div>
            {Icon ? (
              <span className="usr-stat-icon" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
          </>
        )

        const tileClassName = `usr-stat-tile usr-card ${href ? 'usr-lift block' : ''} ${tone || ''}`.trim()

        return href ? (
          <Link key={label} href={href} className={tileClassName} aria-label={`${label}: ${value}`}>
            {content}
          </Link>
        ) : (
          <div key={label} className={tileClassName}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
