import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import {
  buildTouristSpotGeocodeQuery,
  parseNominatimCoordinates,
  touristSpotGeocodeCacheKey,
  TOURIST_SPOT_GEOCODE_CACHE_TTL_MS,
} from '@/lib/touristSpotGeocoding.mjs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const geocodeSupabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function getSearchEndpoint() {
  const endpoint = process.env.NOMINATIM_SEARCH_URL?.trim()
    || 'https://nominatim.openstreetmap.org/search'
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') throw new Error('Nominatim endpoint must use HTTPS.')
  return url
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const params = new URL(request.url).searchParams
  const location = (params.get('location') || '').trim()
  const barangay = (params.get('barangay') || '').trim()
  const refresh = params.get('refresh') === '1'
  if (!location || location.length > 250 || barangay.length > 80) {
    return json({ success: false, message: 'Enter a valid address to look up coordinates.' }, 400)
  }
  if (!geocodeSupabase) {
    return json({ success: false, message: 'Address lookup is not configured.' }, 503)
  }

  const query = buildTouristSpotGeocodeQuery(location, barangay)
  const cacheKey = touristSpotGeocodeCacheKey(location, barangay)

  try {
    if (refresh) {
      const { error: cacheDeleteError } = await geocodeSupabase
        .from('tourist_spot_geocode_cache')
        .delete()
        .eq('query_key', cacheKey)
      if (cacheDeleteError) throw cacheDeleteError
    }

    if (!refresh) {
      const { data: cached, error: cacheReadError } = await geocodeSupabase
        .from('tourist_spot_geocode_cache')
        .select('latitude, longitude')
        .eq('query_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (cacheReadError) throw cacheReadError
      const cachedCoordinates = cached
        ? parseNominatimCoordinates([{ lat: cached.latitude, lon: cached.longitude }])
        : null
      if (cachedCoordinates) return json({ success: true, coordinates: cachedCoordinates })
    }

    const endpoint = getSearchEndpoint()
    endpoint.searchParams.set('format', 'jsonv2')
    endpoint.searchParams.set('limit', '1')
    endpoint.searchParams.set('countrycodes', 'ph')
    endpoint.searchParams.set('accept-language', 'en')
    endpoint.searchParams.set('q', query)

    const { error: rateLimitError } = await geocodeSupabase.rpc('wait_for_tourist_spot_geocode_slot')
    if (rateLimitError) throw rateLimitError
    if (!refresh) {
      const { data: cachedAfterQueue, error: queuedCacheReadError } = await geocodeSupabase
        .from('tourist_spot_geocode_cache')
        .select('latitude, longitude')
        .eq('query_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (queuedCacheReadError) throw queuedCacheReadError
      const cachedCoordinates = cachedAfterQueue
        ? parseNominatimCoordinates([{ lat: cachedAfterQueue.latitude, lon: cachedAfterQueue.longitude }])
        : null
      if (cachedCoordinates) return json({ success: true, coordinates: cachedCoordinates })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let response
    try {
      response = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Connect-Daet-App/1.0 (tourism listing geocoding; https://github.com/forcapstone903-png/Connect-Daet-App)',
        },
        cache: 'no-store',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      console.error('Tourist-spot geocoding provider returned an error:', response.status)
      return json({ success: false, message: 'Address lookup is temporarily unavailable.' }, 503)
    }

    const coordinates = parseNominatimCoordinates(await response.json())
    if (!coordinates) {
      return json({ success: false, message: 'No matching address was found. Enter coordinates manually.' }, 404)
    }

    const { error: cacheWriteError } = await geocodeSupabase
      .from('tourist_spot_geocode_cache')
      .upsert({
        query_key: cacheKey,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        expires_at: new Date(Date.now() + TOURIST_SPOT_GEOCODE_CACHE_TTL_MS).toISOString(),
      }, { onConflict: 'query_key' })
    if (cacheWriteError) throw cacheWriteError

    return json({ success: true, coordinates })
  } catch (error) {
    console.error('Tourist-spot geocoding request failed:', error.name || 'Unknown error')
    return json({ success: false, message: 'Address lookup is temporarily unavailable.' }, 503)
  }
}
