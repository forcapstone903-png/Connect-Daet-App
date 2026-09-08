import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

function getClient() {
  return supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

export async function GET(request) {
  const client = getClient()
  const session = getServerSession(request)
  if (!client || !session?.user_id) return NextResponse.json({ success: false, message: 'User session is required.' }, { status: 401 })

  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data: question, error: questionError } = await client
      .from('daily_feedback_questions')
      .select('id, question, feedback_date, is_active')
      .eq('feedback_date', today)
      .eq('is_active', true)
      .maybeSingle()
    if (questionError) throw questionError

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

    return NextResponse.json({ success: true, question, vote: ownVote?.response || null, votes: votes || [] })
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
        .upsert({ question: questionText, feedback_date: today, created_by: session.user_id, is_active: true }, { onConflict: 'feedback_date' })
        .select('id, question, feedback_date, is_active')
        .single()
      if (error) throw error

      const { data: users, error: usersError } = await client.from('info_users').select('id').eq('status', 'active').neq('user_type', 'admin')
      if (usersError) throw usersError
      if (users?.length) {
        await client.from('info_notifications').insert(users.map((user) => ({
          user_id: user.id,
          title: 'Daily Visitor Feedback',
          message: questionText,
          type: 'feedback',
          link: '/user/dashboard',
          is_read: false,
        })))
      }
      return NextResponse.json({ success: true, question })
    }

    const response = String(body.response || '')
    if (!['positive', 'neutral', 'concern'].includes(response)) return NextResponse.json({ success: false, message: 'Invalid feedback response.' }, { status: 400 })
    const { data: question } = await client.from('daily_feedback_questions').select('id').eq('feedback_date', today).eq('is_active', true).maybeSingle()
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
