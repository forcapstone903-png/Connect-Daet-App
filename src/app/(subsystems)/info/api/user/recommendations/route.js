import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/serverAuth'
import feedRecommendationEngine from '@/lib/feedRecommendationEngine'
import { getInterestRelevanceScore } from '@/lib/userInterests'
import {
  normalizedOverlap,
  normalizePopularity,
  normalizeRecency,
  scorePeople,
  scoreStory,
  scorePlace,
  scoreEvent,
} from '@/lib/personalizedRecommendationScoring.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase()
}

function queryData(result) {
  if (result?.error) throw result.error
  return result?.data || []
}

function daetDateString(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export async function GET(request) {
  const userId = getServerSession(request)?.user_id
  if (!userId) return respond({ success: false, message: 'Please log in to view recommendations.' }, 401)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return respond({ success: false, message: 'Recommendation service is not configured.' }, 500)

  const params = new URL(request.url).searchParams
  const limit = Math.min(20, Math.max(1, Number.parseInt(params.get('limit') || '10', 10) || 10))
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = Date.now()
  const today = daetDateString(now)

  try {
    const [
      viewerResult,
      interestsResult,
      followsResult,
      blocksResult,
      reactionsResult,
      favoritesResult,
      activitiesResult,
      dismissalsResult,
      ratingsResult,
    ] = await Promise.all([
      db.from('info_users').select('id,full_name,city,country,address,profile_image_url,status').eq('id', userId).maybeSingle(),
      db.from('user_feed_preferences').select('preferred_categories').eq('user_id', userId).maybeSingle(),
      db.from('user_follows').select('follower_id,following_id').or(`follower_id.eq.${userId},following_id.eq.${userId}`),
      db.from('user_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      db.from('content_reactions').select('user_id,content_type,content_id,reaction_type,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
      db.from('user_favorites').select('item_type,item_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(300),
      db.from('user_activity_log').select('activity_type,entity_type,entity_id,metadata,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
      db.from('user_content_dismissals').select('content_type,content_id').eq('user_id', userId),
      db.from('attraction_ratings').select('attraction_id,rating').eq('user_id', userId).eq('attraction_type', 'tourist_spot').limit(200),
    ])

    const viewer = queryData(viewerResult)
    const interests = queryData(interestsResult)
    const follows = queryData(followsResult)
    const blocks = queryData(blocksResult)
    const reactions = queryData(reactionsResult)
    const favorites = queryData(favoritesResult)
    const activities = queryData(activitiesResult)
    const dismissals = queryData(dismissalsResult)
    const ratings = queryData(ratingsResult)
    const preferredCategories = (interests?.preferred_categories || []).map((value) => String(value).trim()).filter(Boolean)
    const followedIds = new Set((follows || []).filter((row) => row.follower_id === userId).map((row) => row.following_id))
    const blockedIds = new Set((blocks || []).flatMap((row) => [row.blocker_id, row.blocked_id]).filter((id) => id && id !== userId))
    const dismissed = new Set((dismissals || []).map((row) => `${row.content_type}:${row.content_id}`))
    const viewerCity = normalizeLocation(viewer?.city) || 'daet'

    const [peopleResult, storiesResult, placesResult, eventsResult] = await Promise.all([
      db.from('info_users').select('id,full_name,profile_image_url,bio,city,country,status,user_type,last_login,created_at').eq('status', 'active').neq('id', userId).order('last_login', { ascending: false, nullsFirst: false }).limit(200),
      db.from('info_blogs').select('id,title,excerpt,category,tags,featured_image,published_at,created_at,views,likes,comments_count,created_by,status,approval_status').eq('status', 'published').eq('approval_status', 'approved').order('published_at', { ascending: false }).limit(200),
      db.from('info_tourist_spots').select('id,name,description,category,location,latitude,longitude,rating,review_count,visit_count,tags,featured_image,status,created_at').eq('status', 'active').order('rating', { ascending: false }).limit(200),
      db.from('info_events').select('id,title,description,category,location,venue,latitude,longitude,start_date,end_date,start_time,end_time,featured_image,current_attendees,status,approval_status,created_at').eq('status', 'published').eq('approval_status', 'approved').or(`start_date.gte.${today},and(start_date.lt.${today},end_date.gte.${today})`).order('start_date', { ascending: true }).limit(200),
    ])

    const peopleRows = queryData(peopleResult)
    const storyRows = queryData(storiesResult)
    const placeRows = queryData(placesResult)
    const eventRows = queryData(eventsResult)
    const activeCandidates = peopleRows.filter((person) =>
      !followedIds.has(person.id)
      && !blockedIds.has(person.id)
      && !['admin', 'administrator', 'moderator', 'tourism_officer'].includes(String(person.user_type || '').toLowerCase())
    )
    const profileResult = activeCandidates.length
      ? await db.from('profiles').select('user_id,is_public,privacy_level,privacy_preferences').in('user_id', activeCandidates.map((person) => person.id))
      : { data: [] }
    const profileRows = queryData(profileResult)
    const profileByUserId = new Map(profileRows.map((profile) => [profile.user_id, profile]))
    const people = activeCandidates.filter((person) => {
      const profile = profileByUserId.get(person.id)
      if (profile?.privacy_preferences?.searchable === false) return false
      const privacyLevel = profile?.is_public === false
        ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
        : profile?.privacy_level || 'public'
      return privacyLevel === 'public' || followedIds.has(person.id)
    })
    const mutualRows = people.length
      ? await db.from('user_follows').select('follower_id,following_id').in('following_id', people.map((person) => person.id)).in('follower_id', [...followedIds])
      : { data: [] }
    const mutualFollowRows = queryData(mutualRows)
    const mutualCounts = new Map()
    for (const row of mutualFollowRows) mutualCounts.set(row.following_id, (mutualCounts.get(row.following_id) || 0) + 1)
    const maxMutual = Math.max(1, ...mutualCounts.values())
    const peoplePreferences = people.length
      ? await db.from('user_feed_preferences').select('user_id,preferred_categories').in('user_id', people.map((person) => person.id))
      : { data: [] }
    const peoplePreferenceRows = queryData(peoplePreferences)
    const peopleInterestMap = new Map(peoplePreferenceRows.map((row) => [row.user_id, row.preferred_categories || []]))
    const peopleFollowerCounts = people.length
      ? await db.from('user_follows').select('following_id').in('following_id', people.map((person) => person.id))
      : { data: [] }
    const peopleFollowerRows = queryData(peopleFollowerCounts)
    const popularityByPerson = new Map()
    for (const row of peopleFollowerRows) popularityByPerson.set(row.following_id, (popularityByPerson.get(row.following_id) || 0) + 1)
    const maxPeopleFollowers = Math.max(1, ...popularityByPerson.values())

    const recommendedPeople = people.map((person) => {
      const mutual = normalizePopularity(mutualCounts.get(person.id) || 0, maxMutual)
      const interest = normalizedOverlap(preferredCategories, peopleInterestMap.get(person.id) || [])
      const activity = normalizeRecency(person.last_login, now, 14)
      const popularity = normalizePopularity(popularityByPerson.get(person.id) || 0, maxPeopleFollowers)
      return {
        ...person,
        recommendationScore: scorePeople({ interests: interest, mutual, activity, popularity }),
        reason: mutualCounts.get(person.id)
          ? `${mutualCounts.get(person.id)} shared connection${mutualCounts.get(person.id) === 1 ? '' : 's'}`
          : interest > 0 ? 'Shared interests' : 'Suggested for you',
      }
    }).filter((person) => !dismissed.has(`person:${person.id}`)).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const savedStoryIds = new Set((favorites || []).filter((item) => item.item_type === 'blog').map((item) => item.item_id))
    const viewedStoryIds = new Set((activities || []).filter((activity) => ['blog', 'article'].includes(activity.entity_type)).map((activity) => activity.entity_id).filter(Boolean))
    const likedStoryIds = new Set((reactions || [])
      .filter((reaction) => reaction.content_type === 'blog' && ['like', 'love', 'wow'].includes(reaction.reaction_type))
      .map((reaction) => reaction.content_id))
    const maxStoryEngagement = Math.max(1, ...storyRows.map((story) =>
      (story.likes || 0) + (story.comments_count || 0) * 2 + (story.views || 0) * 0.1
    ))
    const maxStoryPopularity = Math.max(1, ...storyRows.map((story) => (story.likes || 0) + (story.comments_count || 0)))
    const likedStoryTags = storyRows
      .filter((story) => likedStoryIds.has(story.id))
      .flatMap((story) => [...(story.tags || []), story.category].filter(Boolean))

    const recommendedStories = storyRows.filter((story) =>
      !dismissed.has(`story:${story.id}`) &&
      !savedStoryIds.has(story.id)
    ).map((story) => {
      const tags = [...(story.tags || []), story.category].filter(Boolean)
      const interest = getInterestRelevanceScore([story.title, story.excerpt, ...tags], preferredCategories)
      const engagementRaw = (story.likes || 0) + (story.comments_count || 0) * 2 + (story.views || 0) * 0.1
      const engagement = normalizePopularity(engagementRaw, maxStoryEngagement)
      const recency = normalizeRecency(story.published_at || story.created_at, now, 30)
      const popularity = normalizePopularity((story.likes || 0) + (story.comments_count || 0), maxStoryPopularity)
      const interaction = normalizedOverlap(likedStoryTags, tags)
      return {
        ...story,
        recommendationScore: scoreStory({ interest, engagement, recency, popularity, interaction }),
        reason: interest > 0
          ? 'Matches your interests'
          : recency >= 70 ? 'Recently published' : engagement > 0 ? 'Popular story' : 'Suggested for you',
      }
    }).sort((a, b) => Number(viewedStoryIds.has(a.id)) - Number(viewedStoryIds.has(b.id))
      || b.recommendationScore - a.recommendationScore).slice(0, limit)

    const maxPlacePopularity = Math.max(1, ...placeRows.map((place) => (place.visit_count || 0) + (place.review_count || 0)))
    const savedPlaceIds = new Set((favorites || []).filter((item) => ['spot', 'tourist_spot'].includes(item.item_type)).map((item) => item.item_id))
    const placeById = new Map(placeRows.map((place) => [place.id, place]))
    const ratedCategoryTotals = new Map()
    const ratedCategoryCounts = new Map()
    for (const ratingRow of ratings) {
      const category = normalizeLocation(placeById.get(ratingRow.attraction_id)?.category)
      if (!category) continue
      ratedCategoryTotals.set(category, (ratedCategoryTotals.get(category) || 0) + Number(ratingRow.rating || 0))
      ratedCategoryCounts.set(category, (ratedCategoryCounts.get(category) || 0) + 1)
    }

    const recommendedPlaces = placeRows.filter((place) =>
      !dismissed.has(`place:${place.id}`) &&
      !savedPlaceIds.has(place.id)
    ).map((place) => {
      const tags = [...(place.tags || []), place.category].filter(Boolean)
      const interest = getInterestRelevanceScore([place.name, place.description, ...tags], preferredCategories)
      const sameLocation = normalizeLocation(place.location).includes(viewerCity)
      const distance = sameLocation ? 100 : 50
      const rating = normalizePopularity(place.rating || 0, 5)
      const popularity = normalizePopularity((place.visit_count || 0) + (place.review_count || 0), maxPlacePopularity)
      const category = normalizeLocation(place.category)
      const categoryRating = ratedCategoryCounts.get(category)
        ? normalizePopularity(ratedCategoryTotals.get(category) / ratedCategoryCounts.get(category), 5)
        : 0
      return {
        ...place,
        distanceKm: null,
        recommendationScore: scorePlace({ interest, distance, rating, popularity, interaction: categoryRating }),
        reason: interest > 0
          ? 'Matches your interests'
          : sameLocation
            ? `Near ${viewer?.city || 'Daet'}`
            : place.visit_count > 0 ? 'Frequently visited destination'
              : place.review_count > 0 ? 'Community-reviewed destination' : 'Suggested destination',
      }
    }).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const maxEventPopularity = Math.max(1, ...eventRows.map((event) => event.current_attendees || 0))
    const savedEventIds = new Set((favorites || []).filter((item) => item.item_type === 'event').map((item) => item.item_id))

    const recommendedEvents = eventRows.filter((event) =>
      feedRecommendationEngine.isUpcomingEvent(event, now)
        && !dismissed.has(`event:${event.id}`)
        && !savedEventIds.has(event.id)
    ).map((event) => {
      const interest = getInterestRelevanceScore([event.title, event.description, event.category, event.location, event.venue], preferredCategories)
      const sameLocation = normalizeLocation(`${event.location || ''} ${event.venue || ''}`).includes(viewerCity)
      const proximity = sameLocation ? 100 : 50
      const eventDate = new Date(`${event.start_date}T00:00:00+08:00`)
      const daysUntil = Number.isFinite(eventDate.getTime()) ? Math.max(0, (eventDate.getTime() - now) / 86400000) : 365
      const upcoming = clampUpcoming(daysUntil)
      const popularity = normalizePopularity(event.current_attendees || 0, maxEventPopularity)
      return {
        ...event,
        recommendationScore: scoreEvent({ interest, proximity, upcoming, popularity }),
        reason: interest > 0 ? 'Matches your interests' : sameLocation ? 'Upcoming near you' : daysUntil <= 14 ? 'Coming soon' : 'Upcoming event',
      }
    }).sort((a, b) => b.recommendationScore - a.recommendationScore).slice(0, limit)

    const payload = {
      people: recommendedPeople,
      stories: recommendedStories,
      places: recommendedPlaces,
      events: recommendedEvents,
    }
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
