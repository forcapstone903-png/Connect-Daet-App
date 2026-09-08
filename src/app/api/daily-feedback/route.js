import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const FEEDBACK_LIFETIME_MS = 24 * 60 * 60 * 1000

function getClient() {
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

async function getActiveQuestion(client, now = new Date()) {
  const expiresAfter = new Date(now.getTime() - FEEDBACK_LIFETIME_MS).toISOString()
  const { data, error } = await client
    .from('daily_feedback_questions')
    .select('id, question, feedback_date, is_active, created_at')
    .eq('is_active', true)
    .gte('created_at', expiresAfter)
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function GET(request) {
  const client = getClient()
  const session = getServerSession(request)
  if (!client || !session?.user_id) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })

  try {
    const question = await getActiveQuestion(client)

    if (!question) return NextResponse.json({ success: true, question: null, vote: null, votes: [] })

    const { data: ownVote, error: ownVoteError } = await client
      .from('daily_feedback_votes')
      .select('response')
      .eq('question_id', question.id)
      .eq('user_id', session.user_id)
      .maybeSingle()
    if (ownVoteError) throw ownVoteError

    const { data: votes, error: votesError } = session.role === 'admin'
      ? await client.from('daily_feedback_votes').select('response').eq('question_id', question.id)
      : { data: [], error: null }
    if (votesError) throw votesError

    const { data: sentimentRows, error: sentimentError } = await client
      .from('daily_feedback_votes')
      .select('response')
      .eq('question_id', question.id)
    if (sentimentError) throw sentimentError

    const sentiment = (sentimentRows || []).reduce((counts, row) => {
      if (Object.prototype.hasOwnProperty.call(counts, row.response)) counts[row.response] += 1
      return counts
    }, { positive: 0, neutral: 0, concern: 0 })
    const totalResponses = Object.values(sentiment).reduce((total, count) => total + count, 0)

    return NextResponse.json({
      success: true,
      question,
      vote: ownVote?.response || null,
      votes: votes || [],
      sentiment: { ...sentiment, total: totalResponses },
    })
  } catch (error) {
    console.error('Daily feedback load failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load daily feedback.' }, { status: 500 })
  }
}

export async function POST(request) {
  const client = getClient()
  const session = getServerSession(request)
  if (!client || !session?.user_id) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })

  try {
    const body = await request.json()
    const today = new Date().toISOString().slice(0, 10)

    if (body.action === 'publish') {
      if (session.role !== 'admin') return NextResponse.json({ success: false, message: 'Administrator access is required.' }, { status: 403 })
      const questionText = String(body.question || '').trim()
      if (!questionText) return NextResponse.json({ success: false, message: 'A question is required.' }, { status: 400 })

      const { data: question, error } = await client
        .from('daily_feedback_questions')
        .upsert({ question: questionText, feedback_date: today, created_by: session.user_id, is_active: true, created_at: new Date().toISOString() }, { onConflict: 'feedback_date' })
        .select('id, question, feedback_date, is_active')
        .single()
      if (error) throw error

      const { data: users, error: usersError } = await client.from('info_users').select('id').eq('status', 'active').neq('user_type', 'admin')
      if (usersError) throw usersError
      if (users?.length) {
        const userIds = users.map((user) => user.id)
        const { data: existingNotifications, error: existingNotificationsError } = await client
          .from('info_notifications')
          .select('user_id')
          .in('user_id', userIds)
          .eq('title', 'Daily Visitor Feedback')
          .eq('message', questionText)
          .eq('type', 'feedback')
        if (existingNotificationsError) throw existingNotificationsError

        const notifiedUserIds = new Set((existingNotifications || []).map((notification) => notification.user_id))
        const notifications = users
          .filter((user) => !notifiedUserIds.has(user.id))
          .map((user) => ({
          user_id: user.id,
          title: 'Daily Visitor Feedback',
          message: questionText,
          type: 'feedback',
          link: '/user/dashboard',
          is_read: false,
          }))

        if (notifications.length) {
          const { error: notificationError } = await client.from('info_notifications').insert(notifications)
          if (notificationError) throw notificationError
        }
      }
      return NextResponse.json({ success: true, question })
    }

    const response = String(body.response || '')
    if (!['positive', 'neutral', 'concern'].includes(response)) return NextResponse.json({ success: false, message: 'Invalid feedback response.' }, { status: 400 })
    const question = await getActiveQuestion(client)
    if (!question) return NextResponse.json({ success: false, message: 'No daily feedback question is active.' }, { status: 404 })

    const { error } = await client
      .from('daily_feedback_votes')
      .upsert({ question_id: question.id, user_id: session.user_id, response }, { onConflict: 'question_id,user_id' })
    if (error) throw error
    return NextResponse.json({ success: true, response })
  } catch (error) {
    console.error('Daily feedback update failed:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to save daily feedback.' }, { status: 500 })
  }
}
