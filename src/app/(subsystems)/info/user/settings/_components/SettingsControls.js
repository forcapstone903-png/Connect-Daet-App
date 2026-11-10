'use client'

// Shared, presentational primitives for the user Settings tabs. They use the
// app's light utility classes on purpose: the global dark palette in
// src/app/globals.css remaps those surfaces when `html.dark` is active, so no
// hand-written `dark:` variants are needed here.

import { useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'

export function SettingsCard({ icon: Icon, title, description, children, footer, headerAction, className = '' }) {
  return (
    <section className={`usr-card usr-enter settings-card ${className}`}>
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
        className="settings-toggle shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="settings-toggle-knob" />
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
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = options[selectedIndex] || options[0]

  const focusOption = (index) => {
    const optionButtons = triggerRef.current?.parentElement?.querySelectorAll('[role="option"]')
    if (!optionButtons?.length) return
    const normalizedIndex = (index + optionButtons.length) % optionButtons.length
    optionButtons[normalizedIndex]?.focus()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      triggerRef.current?.focus()
      event.preventDefault()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        window.requestAnimationFrame(() => focusOption(Math.max(0, selectedIndex)))
      } else {
        const optionButtons = [...(triggerRef.current?.parentElement?.querySelectorAll('[role="option"]') || [])]
        const currentIndex = optionButtons.indexOf(document.activeElement)
        const direction = event.key === 'ArrowDown' ? 1 : -1
        focusOption(currentIndex < 0 ? Math.max(0, selectedIndex) : currentIndex + direction)
      }
      return
    }

    if ((event.key === 'Enter' || event.key === ' ') && !open) {
      setOpen(true)
      event.preventDefault()
    }
  }

  return (
    <div
      className="settings-control-panel settings-dropdown-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={handleKeyDown}
    >
      <label htmlFor={id} className="settings-control-label">{label}</label>
      {hint ? <p className="settings-control-hint">{hint}</p> : null}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="settings-dropdown-trigger mt-2"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-label={`${label}: ${selectedOption?.label || ''}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedOption?.label || ''}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id={`${id}-options`} className="settings-dropdown-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={option.value === value ? 0 : -1}
              className="settings-dropdown-option"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check className="settings-dropdown-check h-4 w-4" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
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