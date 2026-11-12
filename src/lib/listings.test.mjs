import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BULK_ACTIONS,
  DAET_BARANGAYS,
  DEFAULT_CATEGORIES,
  LISTING_TYPE_VALUES,
  formatListingRow,
  getListingTypeLabel,
  normalizeListingInput,
} from './listings.mjs'
import { canAccessAdminApi } from './staffRoles.mjs'

const valid = {
  name: '  Sample Inn ',
  listing_type: 'accommodation',
  location: 'Bagasbas, Daet',
  category: 'Inn',
  latitude: '14.134',
  longitude: '122.983',
}

test('four listing types with suggested categories', () => {
  assert.deepEqual(LISTING_TYPE_VALUES, ['attraction', 'accommodation', 'restaurant', 'business'])
  for (const type of LISTING_TYPE_VALUES) assert.ok(DEFAULT_CATEGORIES[type].length > 0, type)
  assert.equal(getListingTypeLabel('restaurant'), 'Restaurant')
  assert.equal(getListingTypeLabel('unknown'), 'Attraction')
  assert.equal(DAET_BARANGAYS.length, 25)
})

test('normalizes a valid listing', () => {
  const { data, error } = normalizeListingInput({ ...valid, tags: 'Surf, #Family , surf', website: 'example.com', price_range: '₱₱' })
  assert.equal(error, undefined)
  assert.equal(data.name, 'Sample Inn')
  assert.equal(data.category, 'inn')
  assert.equal(data.latitude, 14.134)
  assert.deepEqual(data.tags, ['surf', 'family'])
  assert.equal(data.website, 'https://example.com/')
  assert.equal(data.price_range, '₱₱')
  assert.equal(data.featured_image, data.image_url)
})

test('website and Facebook page are optional', () => {
  const { data, error } = normalizeListingInput({
    ...valid,
    website: '',
    facebook_url: '',
  })

  assert.equal(error, undefined)
  assert.equal(data.website, null)
  assert.equal(data.facebook_url, null)
})

test('never accepts rating or review counts from the form', () => {
  const { data } = normalizeListingInput({ ...valid, rating: 5, review_count: 999, created_by: 'x' })
  assert.equal('rating' in data, false)
  assert.equal('review_count' in data, false)
  assert.equal('created_by' in data, false)
})

test('rejects invalid input with a clear message', () => {
  assert.match(normalizeListingInput({ ...valid, name: ' ' }).error, /Name/)
  assert.match(normalizeListingInput({ ...valid, latitude: '200' }).error, /Latitude/)
  assert.match(normalizeListingInput({ ...valid, longitude: '' }).error, /both latitude and longitude/)
  assert.match(normalizeListingInput({ ...valid, entrance_fee: '-5' }).error, /fee/)
  assert.match(normalizeListingInput({ ...valid, email: 'not-an-email' }).error, /Email/)
  assert.match(normalizeListingInput({ ...valid, website: 'javascript:alert(1)' }).error, /Website/)
})

test('unknown type, status and price range fall back safely', () => {
  const { data } = normalizeListingInput({ ...valid, listing_type: 'casino', status: 'deleted', price_range: '$$$' })
  assert.equal(data.listing_type, 'attraction')
  assert.equal(data.status, 'active')
  assert.equal(data.price_range, null)
})

test('gallery keeps only http(s) URLs', () => {
  const { data } = normalizeListingInput({ ...valid, gallery_images: ['https://a/x.jpg', 'javascript:x', '', 'http://b/y.png'] })
  assert.deepEqual(data.gallery_images, ['https://a/x.jpg', 'http://b/y.png'])
})

test('bulk actions only touch featured/status', () => {
  for (const changes of Object.values(BULK_ACTIONS)) {
    for (const key of Object.keys(changes)) assert.ok(['featured', 'status'].includes(key))
  }
})

test('formatListingRow fills legacy aliases', () => {
  const row = formatListingRow({ id: '1', entry_fee: 50, images: ['a'], featured_image: 'f' }, 7)
  assert.equal(row.entrance_fee, 50)
  assert.equal(row.image_url, 'f')
  assert.deepEqual(row.gallery_images, ['a'])
  assert.equal(row.listing_type, 'attraction')
  assert.equal(row.view_count, 7)
})

test('tourism officers manage listings; moderators cannot', () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/tourist-spots', method), true, method)
    assert.equal(canAccessAdminApi('moderator', '/info/api/admin/tourist-spots/abc', method), false, method)
  }
})

test('migration 097 adds listing types and locks down public writes', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/097_place_directory.sql', import.meta.url), 'utf8')
  assert.match(sql, /listing_type IN \('attraction', 'accommodation', 'restaurant', 'business'\)/)
  assert.match(sql, /DROP POLICY IF EXISTS "info_tourist_spots_insert_admin_or_owner"/)
  assert.match(sql, /info_tourist_spots_insert_staff[\s\S]*is_tourism_staff/)
  assert.match(sql, /info_events_tourism_staff_update/)
  assert.match(sql, /guard_user_event_moderation/)
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING/)
})

test('admin listings page no longer writes listings from the browser', () => {
  const source = readFileSync(new URL('../app/(subsystems)/info/admin/tourist-spots/page.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from\('info_tourist_spots'\)\s*\.(update|delete|insert)/)
  assert.doesNotMatch(source, /rating: spotForm\.rating/)
})

test('public place bookmarks use the database-supported spot favorite type', () => {
  const directory = readFileSync(new URL('../app/(subsystems)/info/visitor/tourist-spots/page.js', import.meta.url), 'utf8')
  const detail = readFileSync(new URL('../app/(subsystems)/info/visitor/tourist-spots/[id]/page.js', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../../supabase/migrations/066_remove_obsolete_content.sql', import.meta.url), 'utf8')

  assert.match(migration, /item_type IN \('blog', 'event', 'spot', 'forum', 'user_post', 'announcement'\)/)
  assert.match(directory, /item_type', 'spot'/)
  assert.match(directory, /item_type: 'spot'/)
  assert.doesNotMatch(directory, /item_type: 'tourist_spot'|item_type', 'tourist_spot'/)
  assert.match(detail, /item_type', 'spot'/)
  assert.match(detail, /item_type: 'spot'/)
  assert.doesNotMatch(detail, /item_type: 'tourist_spot'|item_type', 'tourist_spot'/)
})
