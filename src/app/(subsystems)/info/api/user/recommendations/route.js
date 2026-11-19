import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import {
  normalizedOverlap,
  normalizeDistance,
  normalizePopularity,
  normalizeRecency,
  haversineDistanceKm,
  scorePeople,
  scoreStory,
  scorePlace,
  scoreEvent,
} from '@/lib/personalizedRecommendationScoring.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const cache = new Map()
const TTL_MS = 12 * 60 * 1000

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase()
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'Please log in to view recommendations.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Recommendation service is not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const limit = Math.min(20, Math.max(1, Number.parseInt(params.get('limit') || '10', 10) || 10))
  const refresh = params.get('refresh') === '1'
  const cacheKey = `${userId}:${limit}`
  if (!refresh) {
    const entry = cache.get(cacheKey)
    if (entry && entry.expiresAt > Date.now()) return respond({ success: true, ...entry.value })
  } else {
    cache.delete(cacheKey)
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = Date.now()

  try {
    const [
      { data: viewer },
      { data: interests },
      { data: follows },
      { data: blocks },
      { data: reactions },
      { data: favorites },
      { data: activities },
      { data: dismissals },
    ] = await Promise.all([
      db.from('info_users').select('id,full_name,city,country,address,profile_image_url,status').eq('id', userId).maybeSingle(),
      db.from('user_feed_preferences').select('preferred_categories').eq('user_id', userId).maybeSingle(),
      db.from('user_follows').select('follower_id,following_id').or(`follower_id.eq.${userId},following_id.eq.${userId}`),
      db.from('user_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      db.from('content_reactions').select('user_id,content_type,content_id,reaction_type,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
      db.from('user_favorites').select('item_type,item_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
      db.from('user_activity_log').select('activity_type,entity_type,entity_id,metadata,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      db.from('user_content_dismissals').select('content_type,content_id').eq('user_id', userId),
    ])

    const preferredCategories = (interests?.preferred_categories || []).map((value) => String(value).trim()).filter(Boolean)
    const followedIds = new Set((follows || []).filter((row) => row.follower_id === userId).map((row) => row.following_id))
    const blockedIds = new Set((blocks || []).flatMap((row) => [row.blocker_id, row.blocked_id]).filter((id) => id && id !== userId))
    const dismissed = new Set((dismissals || []).map((row) => `${row.content_type}:${row.content_id}`))
    const viewerLocation = [viewer?.city, viewer?.address, viewer?.country].map(normalizeLocation).filter(Boolean).join(' ')

    const [peopleResult, storiesResult, placesResult, eventsResult] = await Promise.all([
      db.from('info_users').select('id,full_name,profile_image_url,bio,city,country,status,user_type,last_login,created_at').eq('status', 'active').neq('id', userId).limit(200),
      db.from('info_blogs').select('id,title,excerpt,category,tags,featured_image,published_at,created_at,views,likes,comments_count,created_by,status,approval_status').eq('status', 'published').eq('approval_status', 'approved').order('published_at', { ascending: false }).limit(200),
      db.from('info_tourist_spots').select('id,name,description,category,location,latitude,longitude,rating,review_count,visit_count,tags,featured_image,status,created_at').eq('status', 'active').order('rating', { ascending: false }).limit(200),
      db.from('info_events').select('id,title,description,category,location,venue,latitude,longitude,start_date,end_date,start_time,featured_image,current_attendees,status,approval_status,created_at').eq('status', 'published').eq('approval_status', 'approved').order('start_date', { ascending: true }).limit(200),
    ])

    const people = (peopleResult.data || []).filter((person) =>
      !followedIds.has(person.id)
      && !blockedIds.has(person.id)
      && !['admin', 'administrator', 'moderator', 'tourism_officer'].includes(String(person.user_type || '').toLowerCase())
    )
    const mutualRows = people.length
      ? await db.from('user_follows').select('follower_id,following_id').in('following_id', people.map((person) => person.id)).in('follower_id', [...followedIds])
      : { data: [] }
    const mutualCounts = new Map()
    for (const row of mutualRows.data || []) mutualCounts.set(row.following_id, (mutualCounts.get(row.following_id) || 0) + 1)
    const maxMutual = Math.max(1, ...mutualCounts.values())
    const maxPopularity = Math.max(1, ...people.map((person) => 0))
    const peoplePreferences = people.length
      ? await db.from('user_feed_preferences').select('user_id,preferred_categories').in('user_id', people.map((person) => person.id))
      : { data: [] }
    const peopleInterestMap = new Map((peoplePreferences.data || []).map((row) => [row.user_id, row.preferred_categories || []]))
    const peopleFollowerCounts = people.length
      ? await db.from('user_follows').select('following_id').in('following_id', people.map((person) => person.id))
      : { data: [] }
    const popularityByPerson = new Map()
    for (const row of peopleFollowerCounts.data || []) popularityByPerson.set(row.following_id, (popularityByPerson.get(row.following_id) || 0) + 1)
    const maxPeopleFollowers = Math.max(1, ...popularityByPerson.values())

    const recommendedPeople = people.map((person) => {
      const mutual = normalizePopularity(mutualCounts.get(person.id) || 0, maxMutual)
      const interest = normalizedOverlap(preferredCategories, peopleInterestMap.get(person.id) || [])
      const activityTimestamp = activities?.find((activity) => activity.metadata?.userId === person.id)?.created_at
      const activity = activityTimestamp ? normalizeRecency(activityTimestamp, now, 14) : normalizeRecency(person.last_login, now, 14)
      const popularity = normalizePopularity(popularityByPerson.get(person.id) || 0, maxPeopleFollowers)
      return {
        ...person,
        recommendationScore: scorePeople({ interests: interest, mutual, activity, popularity }),
        reason: mutualCounts.get(person.id) ? `${mutualCounts.get(person.id)} mutual follower${mutualCounts.get(person.id) === 1 ? '' : 's'}` : 'Shared interests',
      }
    }).filter((person) => !dismissed.has(`person:${person.id}`)).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const savedStoryIds = new Set((favorites || []).filter((item) => item.item_type === 'blog').map((item) => item.item_id))
    const viewedStoryIds = new Set((activities || []).filter((activity) => ['blog', 'article'].includes(activity.entity_type)).map((activity) => activity.entity_id).filter(Boolean))
    const reactionCountsByStory = new Map()
    for (const reaction of reactions || []) if (reaction.content_type === 'blog') reactionCountsByStory.set(reaction.content_id, (reactionCountsByStory.get(reaction.content_id) || 0) + 1)
    const maxStoryEngagement = Math.max(1, ...(storiesResult.data || []).map((story) =>
      (story.likes || 0) + (story.comments_count || 0) * 2 + (story.views || 0) * 0.1
    ))
    const maxStoryPopularity = Math.max(1, ...(storiesResult.data || []).map((story) => (story.likes || 0) + (story.comments_count || 0)))

    const recommendedStories = (storiesResult.data || []).filter((story) =>
      !dismissed.has(`story:${story.id}`) &&
      !savedStoryIds.has(story.id)
    ).map((story) => {
      const tags = [...(story.tags || []), story.category].filter(Boolean)
      const interest = normalizedOverlap(preferredCategories, tags)
      const engagementRaw = (story.likes || 0) + (story.comments_count || 0) * 2 + (story.views || 0) * 0.1
      const engagement = normalizePopularity(engagementRaw, maxStoryEngagement)
      const recency = normalizeRecency(story.published_at || story.created_at, now, 30)
      const popularity = normalizePopularity((story.likes || 0) + (story.comments_count || 0), maxStoryPopularity)
      const viewedBoost = viewedStoryIds.has(story.id) ? 0 : 1
      return {
        ...story,
        recommendationScore: scoreStory({ interest, engagement, recency, popularity }) * (0.92 + viewedBoost * 0.08),
        reason: interest >= 60 ? 'Matches your interests' : recency >= 70 ? 'Recently published' : 'Popular story',
      }
    }).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const viewerCoordinates = null
    const maxPlacePopularity = Math.max(1, ...(placesResult.data || []).map((place) => (place.visit_count || 0) + (place.review_count || 0)))
    const savedPlaceIds = new Set((favorites || []).filter((item) => ['spot', 'tourist_spot'].includes(item.item_type)).map((item) => item.item_id))

    const recommendedPlaces = (placesResult.data || []).filter((place) =>
      !dismissed.has(`place:${place.id}`) &&
      !savedPlaceIds.has(place.id)
    ).map((place) => {
      const interest = normalizedOverlap(preferredCategories, [...(place.tags || []), place.category])
      const distanceKm = haversineDistanceKm(viewerCoordinates, place)
      const distance = normalizeDistance(distanceKm)
      const rating = normalizePopularity(place.rating || 0, 5)
      const popularity = normalizePopularity((place.visit_count || 0) + (place.review_count || 0), maxPlacePopularity)
      return {
        ...place,
        distanceKm,
        recommendationScore: scorePlace({ interest, distance: viewerCoordinates && distanceKm !== null ? distance : 50, rating, popularity }),
        reason: interest >= 60 ? 'Matches your interests' : distanceKm !== null ? `${Math.round(distanceKm)} km away` : 'Popular destination',
      }
    }).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const maxEventPopularity = Math.max(1, ...(eventsResult.data || []).map((event) => event.current_attendees || 0))
    const savedEventIds = new Set((favorites || []).filter((item) => item.item_type === 'event').map((item) => item.item_id))

    const recommendedEvents = (eventsResult.data || []).filter((event) => {
      const end = event.end_date ? new Date(`${event.end_date}T23:59:59`) : new Date(`${event.start_date}T23:59:59`)
      return end >= today
        && !dismissed.has(`event:${event.id}`)
        && !savedEventIds.has(event.id)
    }).map((event) => {
      const interest = normalizedOverlap(preferredCategories, [...(event.category ? [event.category] : []), event.title])
      const sameLocation = normalizeLocation(`${event.location || ''} ${event.venue || ''}`).includes(normalizeLocation(viewer?.city || ''))
      const proximity = sameLocation ? 100 : (viewerLocation ? 50 : 50)
      const eventDate = new Date(`${event.start_date}T00:00:00`)
      const daysUntil = Number.isFinite(eventDate.getTime()) ? Math.max(0, (eventDate.getTime() - today.getTime()) / 86400000) : 365
      const upcoming = clampUpcoming(daysUntil)
      const popularity = normalizePopularity(event.current_attendees || 0, maxEventPopularity)
      return {
        ...event,
        recommendationScore: scoreEvent({ interest, proximity, upcoming, popularity }),
        reason: interest >= 60 ? 'Matches your interests' : daysUntil <= 14 ? 'Coming soon' : 'Upcoming event',
      }
    }).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const payload = {
      people: recommendedPeople,
      stories: recommendedStories,
      places: recommendedPlaces,
      events: recommendedEvents,
    }
    cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value: payload })
    return respond({ success: true, ...payload })
  } catch (error) {
    console.error('Personalized recommendations failed:', error)
    return respond({ success: false, message: 'Unable to load recommendations right now.' }, 500)
  }
}

function clampUpcoming(daysUntil) {
  if (!Number.isFinite(daysUntil)) return 0
  return Math.max(0, Math.min(100, 100 - (daysUntil / 365) * 100))
}
