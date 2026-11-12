import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildTouristSpotGeocodeQuery,
  normalizeCoordinates,
  parseNominatimCoordinates,
  touristSpotGeocodeCacheKey,
} from './touristSpotGeocoding.mjs'

test('geocoding migration can be retried after its cache table was created', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/112_tourist_spot_geocoding.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tourist_spot_geocode_cache/)
  assert.match(sql, /CREATE INDEX IF NOT EXISTS tourist_spot_geocode_cache_expires_at_idx/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tourist_spot_geocode_rate_limit/)
})

test('geocoding query is constrained to the Daet tourism area', () => {
  assert.equal(
    buildTouristSpotGeocodeQuery('Bagasbas Beach', 'Bagasbas'),
    'Bagasbas Beach, Bagasbas, Daet, Camarines Norte, Philippines',
  )
})

test('address cache key ignores case and repeated whitespace', () => {
  assert.equal(
    touristSpotGeocodeCacheKey('Bagasbas Beach', 'Bagasbas'),
    touristSpotGeocodeCacheKey('  BAGASBAS   BEACH ', ' bagasbas '),
  )
})

test('only valid latitude and longitude pairs are accepted', () => {
  assert.deepEqual(parseNominatimCoordinates([{ lat: '14.1122', lon: '122.9553' }]), {
    latitude: 14.1122,
    longitude: 122.9553,
  })
  assert.equal(normalizeCoordinates({ latitude: 91, longitude: 122 }), null)
  assert.equal(normalizeCoordinates({ latitude: 14, longitude: -181 }), null)
  assert.equal(normalizeCoordinates({ latitude: null, longitude: null }), null)
  assert.equal(parseNominatimCoordinates([]), null)
})
