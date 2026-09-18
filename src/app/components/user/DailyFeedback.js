'use client'

import { useEffect, useRef, useState } from 'react'

const RESPONSES = [
  { value: 'positive', label: 'Enjoyed it', emoji: '😍', selected: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'neutral', label: 'It was okay', emoji: '😐', selected: 'border-sky-300 bg-sky-50 text-sky-700' },
  { value: 'concern', label: 'Needs improvement', emoji: '😕', selected: 'border-amber-300 bg-amber-50 text-amber-700' },
]

// How long the confirmation stays on screen before the card leaves the feed.
const THANK_YOU_HOLD_MS = 2600
// Must match the `usr-collapse-out` animation duration in globals.css.
const EXIT_ANIMATION_MS = 420

export default function DailyFeedback({ userId }) {
  const [question, setQuestion] = useState(null)
  const [vote, setVote] = useState(null)
  const [saving, setSaving] = useState(false)
  // True while the thank-you confirmation is shown instead of the options.
  const [acknowledged, setAcknowledged] = useState(false)
  // Set once the exit animation starts, then once the card leaves the feed.
  const [leaving, setLeaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState('')
  const dismissTimers = useRef([])

  const clearDismissTimers = () => {
    dismissTimers.current.forEach((timer) => window.clearTimeout(timer))
    dismissTimers.current = []
  }

  useEffect(() => clearDismissTimers, [])

  useEffect(() => {
    let active = true
    const load = async () => {
      const response = await fetch('/api/daily-feedback', { credentials: 'same-origin' })
      const result = await response.json()
      if (!active || !response.ok || !result.success || !result.question) return
      setQuestion(result.question)
      setVote(result.vote || null)
      // Already answered today: the card has done its job, so keep it out of the
      // feed instead of asking the same question again.
      if (result.vote) setDismissed(true)
    }
    void load()
    return () => { active = false }
  }, [userId])

  const submitVote = async (response) => {
    if (!userId || !question || saving) return
    setSaving(true)
    setError('')
    const previous = vote
    // Accept the choice immediately, then confirm it on screen.
    setVote(response)
    setAcknowledged(true)
    clearDismissTimers()
    dismissTimers.current = [
      window.setTimeout(() => setLeaving(true), THANK_YOU_HOLD_MS),
      window.setTimeout(() => setDismissed(true), THANK_YOU_HOLD_MS + EXIT_ANIMATION_MS),
    ]

    try {
      const apiResponse = await fetch('/api/daily-feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!apiResponse.ok) {
        console.error('Daily feedback vote failed:', await apiResponse.text())
        throw new Error('Daily feedback vote failed')
      }
    } catch {
      // Roll the optimistic state back so the visitor can pick again.
      clearDismissTimers()
      setLeaving(false)
      setDismissed(false)
      setAcknowledged(false)
      setVote(previous)
      setError('Your feedback could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Lets a returning visitor revise today's answer instead of being stuck on it.
  const changeAnswer = () => {
    clearDismissTimers()
    setLeaving(false)
    setAcknowledged(false)
  }

  if (!question || dismissed) return null

  return (
    <section
      className={`tourism-panel usr-card rounded-[22px] p-4 sm:p-5 ${leaving ? 'usr-collapse-out' : 'usr-enter'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Daily visitor feedback</p>
          <h2 className="mt-1 text-base font-black text-slate-900">{question.question}</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Today</span>
      </div>

      {acknowledged ? (
        <div className="usr-pop-in mt-4 flex flex-col items-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center" role="status">
          <span className="usr-wink-tap" role="img" aria-label="Winking face">
            <span className="usr-wink text-3xl leading-none">😉</span>
          </span>
          <p className="mt-1 text-sm font-black text-emerald-800">Thank you for giving your feedback!</p>
          <p className="text-[11px] font-semibold text-emerald-700">Your answer was saved for today.</p>
          {!leaving && (
            <button type="button" onClick={changeAnswer} className="usr-press mt-1 text-[11px] font-bold text-emerald-800 underline hover:text-emerald-900">
              Change answer
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {RESPONSES.map(({ value, label, emoji, selected }) => {
            const isSelected = vote === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => submitVote(value)}
                disabled={!userId || saving}
                aria-pressed={isSelected}
                className={`usr-press usr-lift flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-bold transition ${isSelected ? selected : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span
                  className={`text-2xl leading-none ${isSelected ? 'usr-emoji-pop' : ''}`}
                  aria-hidden="true"
                >
                  {emoji}
                </span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="usr-enter mt-3 text-center text-xs font-semibold text-rose-600" role="alert">{error}</p>
      )}
    </section>
  )
}
