'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const RESPONSES = [
  { value: 'positive', label: 'Enjoyed it', emoji: '😍', selected: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { value: 'neutral', label: 'It was okay', emoji: '😐', selected: 'border-sky-300 bg-sky-50 text-sky-700' },
  { value: 'concern', label: 'Needs improvement', emoji: '😕', selected: 'border-amber-300 bg-amber-50 text-amber-700' },
]

export default function DailyFeedback({ userId }) {
  const [question, setQuestion] = useState(null)
  const [vote, setVote] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('daily_feedback_questions')
        .select('id, question, feedback_date')
        .eq('feedback_date', today)
        .eq('is_active', true)
        .maybeSingle()
      if (!active || !data) return
      setQuestion(data)
      if (userId) {
        const { data: existingVote } = await supabase
          .from('daily_feedback_votes')
          .select('response')
          .eq('question_id', data.id)
          .eq('user_id', userId)
          .maybeSingle()
        if (active) setVote(existingVote?.response || null)
      }
    }
    void load()
    return () => { active = false }
  }, [userId])

  const submitVote = async (response) => {
    if (!userId || !question || saving) return
    setSaving(true)
    const previous = vote
    setVote(response)
    const { error } = await supabase
      .from('daily_feedback_votes')
      .upsert({ question_id: question.id, user_id: userId, response }, { onConflict: 'question_id,user_id' })
    if (error) {
      console.error('Daily feedback vote failed:', error)
      setVote(previous)
    }
    setSaving(false)
  }

  if (!question) return null

  return (
    <section className="rounded-[22px] border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Daily visitor feedback</p>
          <h2 className="mt-1 text-base font-black text-slate-900">{question.question}</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Today</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {RESPONSES.map(({ value, label, emoji, selected }) => (
          <button key={value} type="button" onClick={() => submitVote(value)} disabled={!userId || saving} className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-bold transition ${vote === value ? selected : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50'} disabled:cursor-not-allowed disabled:opacity-60`}>
            <span className="text-2xl leading-none" aria-hidden="true">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {vote && <p className="mt-3 text-center text-xs font-semibold text-emerald-700">Thanks for sharing your experience.</p>}
    </section>
  )
}
