'use client'

// Shared, presentational primitives for the user Settings tabs. They use the
// app's light utility classes on purpose: the global dark palette in
// src/app/globals.css remaps those surfaces when `html.dark` is active, so no
// hand-written `dark:` variants are needed here.

import Link from 'next/link'

export function SettingsCard({ icon: Icon, title, description, children, footer, headerAction }) {
  return (
    <section className="usr-card usr-enter settings-card">
      {(title || description) && (
        <div className="settings-card-intro">
          {Icon ? (
            <span className="settings-card-icon">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {title ? <h2 className="settings-card-title">{title}</h2> : null}
            {description ? <p className="settings-card-description">{description}</p> : null}
          </div>
          {headerAction ? <div className="settings-card-header-action">{headerAction}</div> : null}
        </div>
      )}
      <div className="settings-card-content">{children}</div>
      {footer ? <div className="settings-card-footer">{footer}</div> : null}
    </section>
  )
}

export function ToggleRow({ id, label, hint, checked, onChange, disabled = false }) {
  return (
    <div className="settings-toggle-row">
      <div className="min-w-0">
        <label htmlFor={id} className="settings-control-label">{label}</label>
        {hint ? <p className="settings-control-hint">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`settings-toggle relative inline-flex h-8 w-[55px] shrink-0 items-center border transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-blue-600 bg-blue-600' : 'border-blue-600 bg-white'}`}
      >
        <span className={`settings-toggle-knob inline-block h-6 w-6 transform transition ${checked ? 'translate-x-[25px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export function ChoiceCards({ name, options, value, onChange, columns = 3 }) {
  const gridClass = columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'

  return (
    <div className={`settings-choice-list ${gridClass}`} role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`settings-choice-option ${isActive ? 'is-selected' : ''}`}
          >
            <span className="settings-choice-radio-wrap">
              <span className={`settings-choice-radio ${isActive ? 'is-selected' : ''}`}>
                {isActive ? <span className="settings-choice-radio-mark" /> : null}
              </span>
              <span className="settings-choice-copy">
                <span className="settings-control-label">{option.label}</span>
                {option.hint ? <span className="settings-control-hint">{option.hint}</span> : null}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SelectField({ id, label, hint, value, onChange, options }) {
  return (
    <div className="settings-control-panel">
      <label htmlFor={id} className="settings-control-label">{label}</label>
      {hint ? <p className="settings-control-hint">{hint}</p> : null}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="settings-select mt-2 w-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}
export function ActionRow({ icon: Icon, label, hint, children }) {
  return (
    <div className="settings-control-panel settings-action-row">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? <span className="settings-action-icon"><Icon className="h-4 w-4" /></span> : null}
        <div className="min-w-0">
          <p className="settings-control-label">{label}</p>
          {hint ? <p className="settings-control-hint">{hint}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

export function StatusBanner({ tone = 'info', children }) {
  const tones = {
    info: 'usr-inline-note-info',
    success: 'usr-inline-note-success',
    warning: 'border border-amber-200 bg-amber-50 text-amber-900',
    error: 'usr-inline-note-error',
  }

  return (
    <p role="status" className={`usr-inline-note settings-status-banner ${tones[tone] || tones.info}`}>{children}</p>
  )
}

export function PrimaryButton({ children, onClick, disabled = false, type = 'button', tone = 'primary' }) {
  const tones = {
    primary: 'usr-section-primary',
    neutral: 'usr-section-secondary',
    danger: 'usr-press inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-red-700',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${tones[tone] || tones.primary} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  )
}

/**
 * Rounded text link/button. Internal destinations render through next/link so
 * client-side navigation (and the repo's no-html-link lint rule) are respected.
 */
export function LinkButton({ href, children, tone = 'neutral', external = false }) {
  const tones = {
    primary: 'usr-section-primary',
    neutral: 'usr-section-secondary',
  }
  const className = tones[tone] || tones.neutral

  if (external) {
    return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>
  }

  return <Link href={href} className={className}>{children}</Link>
}

export function InlineLink({ href, children }) {
  return <Link href={href} className="text-xs font-bold text-teal-700 hover:text-teal-800">{children}</Link>
}