'use client'

import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, Clock, Vote } from 'lucide-react'
import { supabase } from '@/lib/supabase'

async function fetchPollData(contentType, contentId, userId) {
  const { data, error } = await supabase
    .from('content_polls')
    .select('*')
    .eq('content_type', contentType)
    .eq('content_id', contentId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const polls = data || []
  const pollIds = polls.map((poll) => poll.id)
  const userVotesResult = pollIds.length && userId
    ? await supabase
      .from('poll_votes')
      .select('poll_id, selected_option_index, answer_text, is_correct')
      .in('poll_id', pollIds)
      .eq('user_id', userId)
    : { data: [], error: null }
  if (userVotesResult.error) throw userVotesResult.error

  const userVotes = {}
  ;(userVotesResult.data || []).forEach((vote) => {
    userVotes[vote.poll_id] = vote
  })

  const visiblePollIds = userId
    ? polls
      .filter((poll) => {
        if (poll.results_visibility === 'immediate') return true
        if (poll.results_visibility === 'hidden') return false
        return Boolean(userVotes[poll.id])
          || Boolean(poll.ends_at && new Date(poll.ends_at).getTime() < Date.now())
      })
      .map((poll) => poll.id)
    : []
  const allVotesResult = visiblePollIds.length
    ? await supabase
      .from('poll_votes')
      .select('poll_id, selected_option_index')
      .in('poll_id', visiblePollIds)
    : { data: [], error: null }
  if (allVotesResult.error) throw allVotesResult.error

  const visibleOpenEndedPollIds = polls
    .filter((poll) => {
      return poll.poll_type === 'open_ended' && visiblePollIds.includes(poll.id)
    })
    .map((poll) => poll.id)

  const openAnswersResult = visibleOpenEndedPollIds.length
    ? await supabase
      .from('poll_votes')
      .select('poll_id, answer_text')
      .in('poll_id', visibleOpenEndedPollIds)
      .not('answer_text', 'is', null)
    : { data: [], error: null }
  if (openAnswersResult.error) throw openAnswersResult.error

  const pollResults = {}
  polls.forEach((poll) => {
    pollResults[poll.id] = { totalVotes: 0, optionCounts: {}, answers: [] }
  })
  ;(allVotesResult.data || []).forEach((vote) => {
    const result = pollResults[vote.poll_id]
    if (!result) return
    result.totalVotes += 1
    const optionIndex = Number(vote.selected_option_index)
    if (vote.selected_option_index !== null && Number.isInteger(optionIndex)) {
      result.optionCounts[optionIndex] = (result.optionCounts[optionIndex] || 0) + 1
    }
  })
  ;(openAnswersResult.data || []).forEach((answer) => {
    pollResults[answer.poll_id]?.answers.push(answer.answer_text)
  })

  return { polls, pollResults, userVotes }
}

export default function Polls({ contentType, contentId, userId }) {
  const [polls, setPolls] = useState([])
  const [pollResults, setPollResults] = useState({})
  const [selectedOptions, setSelectedOptions] = useState({})
  const [openAnswers, setOpenAnswers] = useState({})
  const [showResults, setShowResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [userVotes, setUserVotes] = useState({})

  useEffect(() => {
    if (!contentId) return undefined

    let ignore = false
    fetchPollData(contentType, contentId, userId)
      .then((result) => {
        if (ignore) return
        setPolls(result.polls)
        setPollResults(result.pollResults)
        setUserVotes(result.userVotes)
        setLoadError('')
      })
      .catch((err) => {
        if (ignore) return
        console.error('Failed to load polls:', err)
        setLoadError('Polls could not be loaded. Please try again later.')
      })

    return () => {
      ignore = true
    }
  }, [contentId, contentType, userId])

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

      setUserVotes((prev) => ({
        ...prev,
        [poll.id]: { selected_option_index: optionIndex, is_correct: isCorrect },
      }))

      if (poll.results_visibility === 'immediate') {
        setShowResults((prev) => ({ ...prev, [poll.id]: true }))
      }

      const result = await fetchPollData(contentType, contentId, userId)
      setPolls(result.polls)
      setPollResults(result.pollResults)
      setUserVotes(result.userVotes)
      setLoadError('')
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

      setUserVotes((prev) => ({ ...prev, [poll.id]: { answer_text: answer } }))
      const result = await fetchPollData(contentType, contentId, userId)
      setPolls(result.polls)
      setPollResults(result.pollResults)
      setUserVotes(result.userVotes)
      setLoadError('')
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
    return poll.options.map((opt, idx) => ({
      label: typeof opt === 'string' ? opt : opt.label || `Option ${idx + 1}`,
      index: idx,
    }))
  }

  if (polls.length === 0) {
    return loadError ? <p className="text-sm text-red-600" role="alert">{loadError}</p> : null
  }

  return (
    <div className="space-y-4">
      {loadError ? <p className="text-sm text-red-600" role="alert">{loadError}</p> : null}
      {polls.map((poll) => {
        const expired = isExpired(poll)
        const hasVoted = !!userVotes[poll.id]
        const resultsVisible = canSeeResults(poll)
        const options = getOptionsWithVotes(poll)
        const result = pollResults[poll.id] || { totalVotes: 0, optionCounts: {}, answers: [] }

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
                    {resultsVisible ? <span>{result.totalVotes} votes</span> : null}
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
                {poll.poll_type === 'open_ended' ? (
                  result.answers.length ? (
                    <ul className="space-y-1">
                      {result.answers.map((answer, index) => (
                        <li key={`${poll.id}-answer-${index}`} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                          {answer}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No responses yet.</p>
                  )
                ) : (
                  <div className="space-y-1">
                    {options.map((option) => {
                      const count = result.optionCounts[option.index] || 0
                      const percentage = result.totalVotes ? Math.round((count / result.totalVotes) * 100) : 0
                      return (
                        <div key={option.index} className="flex items-center gap-2 text-xs">
                          <span className="w-1/2 truncate text-slate-600">{option.label}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-sky-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums text-slate-500">{percentage}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {hasVoted && (
              <p className="mt-2 text-[10px] font-semibold text-emerald-600">✓ You&apos;ve voted on this poll</p>
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