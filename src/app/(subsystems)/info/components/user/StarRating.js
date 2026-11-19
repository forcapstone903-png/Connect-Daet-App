'use client'

import { Star } from 'lucide-react'

export default function StarRating({
  value = 0,
  onChange,
  readOnly = false,
  compact = false,
  label = 'Rating',
}) {
  const stars = [1, 2, 3, 4, 5]
  const iconClassName = compact ? 'h-4 w-4' : 'h-5 w-5'

  const handleKeyDown = (event, currentRating) => {
    let nextRating
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextRating = Math.min(5, currentRating + 1)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextRating = Math.max(1, currentRating - 1)
    if (event.key === 'Home') nextRating = 1
    if (event.key === 'End') nextRating = 5
    if (!nextRating) return

    event.preventDefault()
    onChange(nextRating)
    event.currentTarget.parentElement
      ?.querySelector(`[data-star="${nextRating}"]`)
      ?.focus()
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${value} out of 5 stars` : label}
    >
      {stars.map((star) => {
        const selected = star <= value
        const icon = (
          <Star
            aria-hidden="true"
            className={`${iconClassName} transition-colors ${
              selected
                ? 'fill-amber-400 text-amber-500'
                : 'text-slate-300'
            }`}
          />
        )

        if (readOnly) {
          return <span key={star} className="flex h-5 w-5 items-center justify-center">{icon}</span>
        }

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            aria-checked={value === star}
            tabIndex={value === star || (!value && star === 1) ? 0 : -1}
            data-star={star}
            onClick={() => onChange(star)}
            onKeyDown={(event) => handleKeyDown(event, star)}
            className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:scale-110 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-600"
          >
            <Star
              aria-hidden="true"
              className={`${iconClassName} transition-colors group-hover:fill-amber-300 group-hover:text-amber-500 ${
                selected ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
