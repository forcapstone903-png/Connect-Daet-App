import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import { normalizedOverlap, normalizePopularity, normalizeRecency, haversineDistanceKm, normalizeDistance, scoreStory, scorePlace, scoreEvent } from '@/lib/personalizedRecommendationScoring.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

function terms(value) {
  return String(value || '').toLowerCase().split(/[,\s]+/).filter((term) => term.length >= 2)
}

function matchesText(record, fields, q) {
  if (!q) return true
  const haystack = fields.map((field) => String(record[field] || '')).join(' ').toLowerCase()
  return terms(q).every((term) => haystack.includes(term))
}

export async function GET(request) {
  const session = getServerSession(request)
  const userId = session?.user_id || null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Discovery service is not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const type = String(params.get('type') || 'all').trim()
  const q = String(params.get('q') || '').trim().slice(0, 120)
  const categories = [...new Set(String(params.get('categories') || '').split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 10)
  const location = String(params.get('location') || '').trim().slice(0, 120)
  const sort = String(params.get('sort') || 'relevance').trim()
  const dateRange = String(params.get('date') || 'all').trim()
  const freeOnly = params.get('free') === '1'
  const followingOnly = params.get('following') === '1'
  const savedOnly = params.get('saved') === '1'
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(params.get('pageSize') || '20', 10) || 20))

  if (!['all', 'people', 'spots', 'events', 'blogs', 'threads'].includes(type)) {
    return respond({ success: false, message: 'Invalid discovery type.' }, 400)
  }
  if (!['relevance', 'recent', 'popular', 'liked', 'commented', 'viewed', 'rated', 'reviewed', 'distance', 'mutual', 'most_followed', 'active', 'joined'].includes(sort)) {
    return respond({ success: false, message: 'Invalid discovery sort.' }, 400)
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = Date.now()

  try {
    const [preferenceResult, followResult, favoriteResult, blockResult, viewerResult] = await Promise.all([
      userId
        ? db.from('user_feed_preferences').select('preferred_categories').eq('user_id', userId).maybeSingle()
        : { data: null, error: null },
      userId
        ? db.from('user_follows').select('follower_id,following_id').or(`follower_id.eq.${userId},following_id.eq.${userId}`)
        : { data: [], error: null },
      userId
        ? db.from('user_favorites').select('item_type,item_id').eq('user_id', userId)
        : { data: [], error: null },
      userId
        ? db.from('user_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
        : { data: [], error: null },
      userId
        ? db.from('info_users').select('id,city,country,address').eq('id', userId).maybeSingle()
        : { data: null, error: null },
    ])

    const preferred = (preferenceResult.data?.preferred_categories || []).map((value) => String(value).trim()).filter(Boolean)
    const followedIds = new Set((followResult.data || []).filter((row) => row.follower_id === userId).map((row) => row.following_id))
    const blockedIds = new Set((blockResult.data || []).flatMap((row) => [row.blocker_id, row.blocked_id]).filter((id) => id && id !== userId))
    const savedIds = new Set((favoriteResult.data || []).map((item) => `${item.item_type}:${item.item_id}`))

    let people = []
    let spots = []
    let events = []
    let blogs = []
    let threads = []

    if (type === 'all' || type === 'people') {
      let queryBuilder = db
        .from('info_users')
        .select('id,full_name,profile_image_url,bio,city,country,status,user_type,created_at,last_login')
        .eq('status', 'active')
        .neq('id', userId || '')
        .limit(300)
      const { data } = await queryBuilder
      const candidates = (data || []).filter((person) =>
        !blockedIds.has(person.id)
        && !followedIds.has(person.id)
        && !['admin', 'administrator', 'moderator', 'tourism_officer'].includes(String(person.user_type || '').toLowerCase())
        && matchesText(person, ['full_name', 'bio', 'city', 'country'], q)
      )
      const ids = candidates.map((person) => person.id)
      const [preferences, followerRows, mutualRows] = await Promise.all([
        ids.length ? db.from('user_feed_preferences').select('user_id,preferred_categories').in('user_id', ids) : { data: [] },
        ids.length ? db.from('user_follows').select('following_id').in('following_id', ids) : { data: [] },
        ids.length && followedIds.size ? db.from('user_follows').select('following_id').in('following_id', ids).in('follower_id', [...followedIds]) : { data: [] },
      ])
      const interestMap = new Map((preferences.data || []).map((row) => [row.user_id, row.preferred_categories || []]))
      const followerCounts = new Map()
      for (const row of followerRows.data || []) followerCounts.set(row.following_id, (followerCounts.get(row.following_id) || 0) + 1)
      const mutualCounts = new Map()
      for (const row of mutualRows.data || []) mutualCounts.set(row.following_id, (mutualCounts.get(row.following_id) || 0) + 1)
      const maxFollowers = Math.max(1, ...followerCounts.values())
      people = candidates.map((person) => {
        const interest = normalizedOverlap(preferred, interestMap.get(person.id) || [])
        const mutual = normalizePopularity(mutualCounts.get(person.id) || 0, Math.max(1, ...mutualCounts.values()))
        const activity = normalizeRecency(person.last_login, now, 14)
        const popularity = normalizePopularity(followerCounts.get(person.id) || 0, maxFollowers)
        return { ...person, follower_count: followerCounts.get(person.id) || 0, recommendationScore: interest * 0.30 + mutual * 0.25 + activity * 0.25 + popularity * 0.20, mutualCount: mutualCounts.get(person.id) || 0 }
      })
      if (location) people = people.filter((person) => `${person.city || ''} ${person.country || ''}`.toLowerCase().includes(location.toLowerCase()))
      if (followingOnly) people = people.filter((person) => followedIds.has(person.id))
      if (sort === 'mutual') people.sort((a, b) => b.mutualCount - a.mutualCount)
      else if (sort === 'most_followed') people.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0))
      else if (sort === 'active') people.sort((a, b) => new Date(b.last_login || 0) - new Date(a.last_login || 0))
      else if (sort === 'joined') people.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      else people.sort((a, b) => b.recommendationScore - a.recommendationScore)
    }

    if (type === 'all' || type === 'blogs') {
      let builder = db
        .from('info_blogs')
        .select('id,title,excerpt,category,tags,featured_image,published_at,created_at,views,likes,comments_count,created_by,status,approval_status')
        .eq('status', 'published')
        .eq('approval_status', 'approved')
        .order('published_at', { ascending: false })
        .limit(300)
      const { data } = await builder
      blogs = (data || []).filter((story) => {
        if (!matchesText(story, ['title', 'excerpt', 'category'], q)) return false
        if (categories.length && !categories.some((category) => String(story.category || '').toLowerCase() === category.toLowerCase() || (story.tags || []).some((tag) => String(tag).toLowerCase() === category.toLowerCase()))) return false
        if (savedOnly && !savedIds.has(`blog:${story.id}`)) return false
        if (followingOnly && !followedIds.has(story.created_by)) return false
        return true
      }).map((story) => {
        const tags = [...(story.tags || []), story.category].filter(Boolean)
        const interest = normalizedOverlap(preferred, tags)
        const engagement = normalizePopularity((story.likes || 0) + (story.comments_count || 0) * 2 + (story.views || 0) * 0.1, Math.max(1, ...(data || []).map((item) => (item.likes || 0) + (item.comments_count || 0) * 2 + (item.views || 0) * 0.1)))
        const recency = normalizeRecency(story.published_at || story.created_at, now, 30)
        const popularity = normalizePopularity((story.likes || 0) + (story.comments_count || 0), Math.max(1, ...(data || []).map((item) => (item.likes || 0) + (item.comments_count || 0))))
        return { ...story, recommendationScore: scoreStory({ interest, engagement, recency, popularity }) }
      })
      if (sort === 'recent') blogs.sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0))
      else if (sort === 'liked') blogs.sort((a, b) => (b.likes || 0) - (a.likes || 0))
      else if (sort === 'commented') blogs.sort((a, b) => (b.comments_count || 0) - (a.comments_count || 0))
      else if (sort === 'viewed') blogs.sort((a, b) => (b.views || 0) - (a.views || 0))
      else if (sort === 'popular') blogs.sort((a, b) => ((b.likes || 0) + (b.comments_count || 0) + (b.views || 0)) - ((a.likes || 0) + (a.comments_count || 0) + (a.views || 0)))
      else blogs.sort((a, b) => b.recommendationScore - a.recommendationScore)
    }

    if (type === 'all' || type === 'spots') {
      const { data } = await db
        .from('info_tourist_spots')
        .select('id,name,description,category,location,barangay,latitude,longitude,rating,review_count,visit_count,tags,entry_fee,featured_image,status,created_at')
        .eq('status', 'active')
        .limit(300)
      spots = (data || []).filter((place) => {
        if (!matchesText(place, ['name', 'description', 'category', 'location', 'barangay'], q)) return false
        if (categories.length && !categories.some((category) => String(place.category || '').toLowerCase() === category.toLowerCase() || (place.tags || []).some((tag) => String(tag).toLowerCase() === category.toLowerCase()))) return false
        if (location && !`${place.location || ''} ${place.barangay || ''}`.toLowerCase().includes(location.toLowerCase())) return false
        if (savedOnly && !savedIds.has(`spot:${place.id}`)) return false
        return true
      }).map((place) => {
        const interest = normalizedOverlap(preferred, [...(place.tags || []), place.category])
        const origin = viewerResult.data?.latitude && viewerResult.data?.longitude
          ? { latitude: viewerResult.data.latitude, longitude: viewerResult.data.longitude }
          : null
        const distanceKm = haversineDistanceKm(origin, place)
        const rating = normalizePopularity(place.rating || 0, 5)
        const popularity = normalizePopularity((place.visit_count || 0) + (place.review_count || 0), Math.max(1, ...(data || []).map((item) => (item.visit_count || 0) + (item.review_count || 0))))
        return { ...place, distanceKm, recommendationScore: scorePlace({ interest, distance: distanceKm !== null ? normalizeDistance(distanceKm) : 50, rating, popularity }) }
      })
      if (sort === 'rated') spots.sort((a, b) => (b.rating || 0) - (a.rating || 0))
      else if (sort === 'reviewed') spots.sort((a, b) => (b.review_count || 0) - (a.review_count || 0))
      else if (sort === 'popular') spots.sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
      else if (sort === 'recent') spots.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      else if (sort === 'distance') spots.sort((a, b) => (a.distanceKm === null ? Infinity : a.distanceKm) - (b.distanceKm === null ? Infinity : b.distanceKm))
      else spots.sort((a, b) => b.recommendationScore - a.recommendationScore)
    }

    if (type === 'all' || type === 'events') {
      const { data } = await db
        .from('info_events')
        .select('id,title,description,category,location,venue,latitude,longitude,start_date,end_date,start_time,featured_image,current_attendees,is_free,ticket_price,status,approval_status,created_at')
        .eq('status', 'published')
        .eq('approval_status', 'approved')
        .limit(300)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      events = (data || []).filter((event) => {
        const end = event.end_date ? new Date(`${event.end_date}T23:59:59`) : new Date(`${event.start_date}T23:59:59`)
        if (end < today) return false
        if (!matchesText(event, ['title', 'description', 'category', 'location', 'venue'], q)) return false
        if (categories.length && !categories.some((category) => String(event.category || '').toLowerCase() === category.toLowerCase())) return false
        if (location && !`${event.location || ''} ${event.venue || ''}`.toLowerCase().includes(location.toLowerCase())) return false
        if (freeOnly && event.is_free !== true) return false
        if (followingOnly && !followedIds.has(event.created_by)) return false
        if (savedOnly && !savedIds.has(`event:${event.id}`)) return false
        if (dateRange === 'today') {
          const todayText = today.toISOString().slice(0, 10)
          if (String(event.start_date).slice(0, 10) !== todayText) return false
        }
        if (dateRange === 'week') {
          const endWeek = new Date(today)
          endWeek.setDate(endWeek.getDate() + 7)
          if (new Date(`${event.start_date}T00:00:00`) > endWeek) return false
        }
        if (dateRange === 'month') {
          const endMonth = new Date(today)
          endMonth.setMonth(endMonth.getMonth() + 1)
          if (new Date(`${event.start_date}T00:00:00`) > endMonth) return false
        }
        return true
      }).map((event) => {
        const interest = normalizedOverlap(preferred, [event.category, event.title])
        const start = new Date(`${event.start_date}T00:00:00`)
        const days = Number.isFinite(start.getTime()) ? Math.max(0, (start.getTime() - today.getTime()) / 86400000) : 365
        const upcoming = Math.max(0, Math.min(100, 100 - days / 365 * 100))
        const popularity = normalizePopularity(event.current_attendees || 0, Math.max(1, ...(data || []).map((item) => item.current_attendees || 0)))
        const sameLocation = `${event.location || ''} ${event.venue || ''}`.toLowerCase().includes(String(viewerResult.data?.city || '').toLowerCase())
        return { ...event, recommendationScore: scoreEvent({ interest, proximity: sameLocation ? 100 : 50, upcoming, popularity }) }
      })
      if (sort === 'popular') events.sort((a, b) => (b.current_attendees || 0) - (a.current_attendees || 0))
      else if (sort === 'recent') events.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      else events.sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0) || b.recommendationScore - a.recommendationScore)
    }

    if (type === 'all' || type === 'threads') {
      let builder = db
        .from('forum_threads')
        .select('id,title,content,created_by,last_activity_at,created_at,reply_count,status')
        .in('status', ['published', 'closed'])
        .limit(300)
      const { data } = await builder
      threads = (data || []).filter((thread) =>
        matchesText(thread, ['title', 'content'], q)
        && (!followingOnly || followedIds.has(thread.created_by))
        && (!savedOnly || savedIds.has(`forum:${thread.id}`))
      )
      if (sort === 'popular') threads.sort((a, b) => (b.reply_count || 0) - (a.reply_count || 0))
      else if (sort === 'recent') threads.sort((a, b) => new Date(b.last_activity_at || b.created_at || 0) - new Date(a.last_activity_at || a.created_at || 0))
    }

    const combined = [
      ...people.map((item) => ({ type: 'people', id: item.id, item })),
      ...spots.map((item) => ({ type: 'spots', id: item.id, item })),
      ...events.map((item) => ({ type: 'events', id: item.id, item })),
      ...blogs.map((item) => ({ type: 'blogs', id: item.id, item })),
      ...threads.map((item) => ({ type: 'threads', id: item.id, item })),
    ]
    const start = (page - 1) * pageSize
    const paged = combined.slice(start, start + pageSize)

    return respond({
      success: true,
      people,
      spots,
      events,
      blogs,
      threads,
      combined: paged,
      count: combined.length,
      pagination: { page, pageSize, pages: Math.ceil(combined.length / pageSize) },
    })
  } catch (error) {
    console.error('Discovery filtering failed:', error)
    return respond({ success: false, message: 'Unable to load filtered recommendations.' }, 500)
  }
}
