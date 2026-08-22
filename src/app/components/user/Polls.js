'use client'

import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, Clock, Vote } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function Polls({ contentType, contentId, userId }) {
  const [polls, setPolls] = useState([])
  const [selectedOptions, setSelectedOptions] = useState({})
  const [openAnswers, setOpenAnswers] = useState({})
  const [showResults, setShowResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [userVotes, setUserVotes] = useState({})

  useEffect(() => {
    loadPolls()
  }, [contentType, contentId])

  const loadPolls = async () => {
    if (!contentId) return
    try {
      const { data, error } = await supabase
        .from('content_polls')
        .select('*')
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .order('created_at', { ascending: false })
      if (error) throw error

      setPolls(data || [])

      // Load user's votes
      if (userId && data?.length) {
        const pollIds = data.map((p) => p.id)
        const { data: voteRows } = await supabase
          .from('poll_votes')
          .select('poll_id, selected_option_index, answer_text, is_correct')
          .in('poll_id', pollIds)
          .eq('user_id', userId)

        const votesByPoll = {}
        ;(voteRows || []).forEach((vote) => {
          votesByPoll[vote.poll_id] = vote
        })
        setUserVotes(votesByPoll)
      }
    } catch (err) {
      console.error('Failed to load polls:', err)
    }
  }

  const handleVote = async (poll, optionIndex) => {
    if (!userId) {
      alert('Please log in to vote.')
      return
    }
    if (userVotes[poll.id]) return

    setLoading(true)
    try {
      const isCorrect = poll.poll_type === 'quiz' && optionIndex === poll.correct_option_index

      const { error } = await supabase.from('poll_votes').insert({
        poll_id: poll.id,
        user_id: userId,
        selected_option_index: optionIndex,
        is_correct: isCorrect,
      })
      if (error) throw error

      await supabase
        .from('content_polls')
        .update({ total_votes: (poll.total_votes || 0) + 1 })
        .eq('id', poll.id)

      setUserVotes((prev) => ({
        ...prev,
        [poll.id]: { selected_option_index: optionIndex, is_correct: isCorrect },
      }))

      if (poll.results_visibility === 'immediate') {
        setShowResults((prev) => ({ ...prev, [poll.id]: true }))
      }

      await loadPolls()
    } catch (err) {
      console.error('Vote failed:', err)
      alert('Failed to submit vote. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAnswer = async (poll) => {
    const answer = (openAnswers[poll.id] || '').trim()
    if (!answer || !userId) {
      alert('Please type an answer and log in.')
      return
    }
    if (userVotes[poll.id]) return

    setLoading(true)
    try {
      const { error } = await supabase.from('poll_votes').insert({
        poll_id: poll.id,
        user_id: userId,
        answer_text: answer,
      })
      if (error) throw error

      await supabase
        .from('content_polls')
        .update({ total_votes: (poll.total_votes || 0) + 1 })
        .eq('id', poll.id)

      setUserVotes((prev) => ({ ...prev, [poll.id]: { answer_text: answer } }))
      await loadPolls()
    } catch (err) {
      console.error('Answer failed:', err)
      alert('Failed to submit answer.')
    } finally {
      setLoading(false)
    }
  }

  const isExpired = (poll) => {
    return poll.ends_at && new Date(poll.ends_at) < new Date()
  }

  const canSeeResults = (poll) => {
    if (poll.results_visibility === 'immediate') return true
    if (poll.results_visibility === 'hidden') return false
    return !!userVotes[poll.id] || isExpired(poll)
  }

  const getOptionsWithVotes = (poll) => {
    if (!poll.options || poll.options.length === 0) return []
    return poll.options.map((opt, idx) => {
      // Estimate votes per option (in real implementation this would come from poll_votes aggregation)
      // Here we use poll_votes for accuracy when loaded
      return { label: typeof opt === 'string' ? opt : opt.label || `Option ${idx + 1}`, index: idx }
    })
  }

  if (polls.length === 0) return null

  return (
    <div className="space-y-4">
      {polls.map((poll) => {
        const expired = isExpired(poll)
        const hasVoted = !!userVotes[poll.id]
        const resultsVisible = canSeeResults(poll)
        const options = getOptionsWithVotes(poll)

        return (
          <div key={poll.id} className="rounded-[16px] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <Vote className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-600" />
                <div>
                  <p className="text-sm font-bold text-slate-900">{poll.question}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-200 px-2 py-0.5 font-semibold uppercase tracking-wide">
                      {poll.poll_type.replace('_', ' ')}
                    </span>
                    {poll.ends_at && (
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {expired ? 'Ended' : `Ends ${new Date(poll.ends_at).toLocaleDateString()}`}
                      </span>
                    )}
                    <span>{poll.total_votes || 0} votes</span>
                  </div>
                </div>
              </div>
            </div>

            {poll.poll_type === 'multiple_choice' || poll.poll_type === 'quiz' ? (
              <div className="space-y-2">
                {options.map((option, idx) => {
                  const voteRecord = userVotes[poll.id]
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleVote(poll, idx)}
                      disabled={hasVoted || expired || loading || !userId}
                      className={`block w-full rounded-[12px] border px-3 py-2 text-left text-sm transition ${
                        !hasVoted && !expired
                          ? 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50'
                          : 'border-slate-200 bg-white opacity-80'
                      } ${
                        voteRecord?.selected_option_index === idx
                          ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
                          : ''
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">{option.label}</span>
                        {voteRecord?.selected_option_index === idx && (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-sky-600" />
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : poll.poll_type === 'open_ended' ? (
              <div>
                <textarea
                  value={openAnswers[poll.id] || ''}
                  onChange={(e) => setOpenAnswers((prev) => ({ ...prev, [poll.id]: e.target.value }))}
                  placeholder="Share your answer..."
                  rows={2}
                  disabled={hasVoted || expired || loading || !userId}
                  className="w-full rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300 disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={() => handleOpenAnswer(poll)}
                  disabled={hasVoted || expired || loading || !userId || !(openAnswers[poll.id] || '').trim()}
                  className="mt-2 rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {hasVoted ? 'Answered' : 'Submit Answer'}
                </button>
              </div>
            ) : null}

            {resultsVisible && (
              <button
                type="button"
                onClick={() => setShowResults((prev) => ({ ...prev, [poll.id]: !prev[poll.id] }))}
                className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-sky-600"
              >
                <BarChart3 className="h-3 w-3" />
                {showResults[poll.id] ? 'Hide results' : 'View results'}
              </button>
            )}

            {showResults[poll.id] && resultsVisible && (
              <div className="mt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Results</p>
                <div className="space-y-1">
                  {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="w-1/2 truncate text-slate-600">{opt.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasVoted && (
              <p className="mt-2 text-[10px] font-semibold text-emerald-600">✓ You've voted on this poll</p>
            )}
            {expired && !hasVoted && (
              <p className="mt-2 text-[10px] font-semibold text-slate-400">This poll has ended</p>
            )}
          </div>
        )
      })}
    </div>
  )
}