'use client'

// Shared, presentational primitives for the user Settings tabs. They use the
// app's light utility classes on purpose: the global dark palette in
// src/app/globals.css remaps those surfaces when `html.dark` is active, so no
// hand-written `dark:` variants are needed here.

import Link from 'next/link'

export function SettingsCard({ icon: Icon, title, description, children, footer }) {
  return (
    <section className="usr-card usr-enter p-4 sm:p-6">
      {(title || description) && (
        <div className="mb-5 flex items-start gap-3">
          {Icon ? (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {title ? <h2 className="text-base font-black text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
        </div>
      )}
      <div className="space-y-3">{children}</div>
      {footer ? <div className="mt-5 border-t border-slate-200 pt-4">{footer}</div> : null}
    </section>
  )
}

export function ToggleRow({ id, label, hint, checked, onChange, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
        {hint ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-teal-700 bg-teal-700' : 'border-slate-300 bg-slate-200'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export function ChoiceCards({ name, options, value, onChange, columns = 3 }) {
  const gridClass = columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'

  return (
    <div className={`grid gap-2 ${gridClass}`} role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border px-3 py-3 text-left transition ${isActive ? 'border-teal-600 bg-teal-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:border-teal-300'}`}
          >
            <span className="flex items-center gap-2">
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${isActive ? 'border-teal-700 bg-teal-700' : 'border-slate-300 bg-white'}`}>
                {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <span className="text-sm font-bold text-slate-900">{option.label}</span>
            </span>
            {option.hint ? <span className="mt-1 block text-xs leading-5 text-slate-500">{option.hint}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function SelectField({ id, label, hint, value, onChange, options }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      {hint ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-600 focus:outline-none"
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
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm"><Icon className="h-4 w-4" /></span> : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {hint ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{hint}</p> : null}
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
    <p role="status" className={`usr-inline-note ${tones[tone] || tones.info}`}>{children}</p>
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