'use client'

import { Check, Sparkles } from 'lucide-react'
import { USER_INTEREST_CATEGORIES } from '@/lib/userInterests'

export default function InterestSelector({ selectedInterests = [], onToggle, disabled = false }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {USER_INTEREST_CATEGORIES.map((interest) => {
        const selected = selectedInterests.includes(interest)
        return (
          <button
            key={interest}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(interest)}
            className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-200'
                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50'
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            </span>
            <span className="flex-1">{interest}</span>
          </button>
        )
      })}
    </div>
  )
}
