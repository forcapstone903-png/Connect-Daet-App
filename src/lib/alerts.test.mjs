import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PUBLIC_ALERT_COLUMNS,
  getAlertPhase,
  normalizeAlertInput,
  normalizeSentAlertEdit,
  normalizeTemplateInput,
  sortAlertsByUrgency,
  summarizeReach,
} from './alerts.mjs'
import { validatePushSubscription } from './pushSubscriptionValidation.mjs'
import { canAccessAdminApi, canAccessAdminPage } from './staffRoles.mjs'

const now = new Date('2026-11-11T08:00:00Z')
const base = { title: 'Heavy rain warning', message: 'Expect flooding in low areas.', category: 'weather', severity: 'warning' }
const iso = (minutes) => new Date(now.getTime() + minutes * 60_000).toISOString()

test('send now, schedule and draft map to the right status', () => {
  const sendNow = normalizeAlertInput({ ...base, delivery: 'now' }, { now })
  assert.equal(sendNow.data.status, 'scheduled')
  assert.equal(sendNow.data.scheduled_for, now.toISOString())

  const scheduled = normalizeAlertInput({ ...base, delivery: 'schedule', scheduled_for: iso(90) }, { now })
  assert.equal(scheduled.data.scheduled_for, iso(90))

  const draft = normalizeAlertInput({ ...base, delivery: 'draft' }, { now })
  assert.equal(draft.data.status, 'draft')
  assert.equal(draft.data.scheduled_for, null)
})

test('rejects bad alerts with clear messages', () => {
  assert.match(normalizeAlertInput({ ...base, title: 'a' }, { now }).error, /Title/)
  assert.match(normalizeAlertInput({ ...base, message: '' }, { now }).error, /Message/)
  assert.match(normalizeAlertInput({ ...base, severity: 'apocalyptic' }, { now }).error, /severity/)
  assert.match(normalizeAlertInput({ ...base, category: 'nope' }, { now, categories: ['weather'] }).error, /category/)
  assert.match(normalizeAlertInput({ ...base, delivery: 'schedule' }, { now }).error, /when/)
  assert.match(normalizeAlertInput({ ...base, delivery: 'schedule', scheduled_for: iso(-5) }, { now }).error, /one minute/)
  assert.match(normalizeAlertInput({ ...base, delivery: 'schedule', scheduled_for: iso(61 * 24 * 60) }, { now }).error, /60 days/)
  assert.match(normalizeAlertInput({ ...base, delivery: 'now', expires_at: iso(-1) }, { now }).error, /End time/)
  assert.match(normalizeAlertInput({ ...base, delivery: 'schedule', scheduled_for: iso(120), expires_at: iso(60) }, { now }).error, /End time/)
})

test('barangays are limited to the official list and audience defaults to category', () => {
  const { data } = normalizeAlertInput({ ...base, barangays: ['Bagasbas', 'Atlantis', 'Bagasbas'] }, { now })
  assert.deepEqual(data.barangays, ['Bagasbas'])
  assert.equal(data.audience, 'category')
})

test('alert life cycle phases', () => {
  assert.equal(getAlertPhase({ status: 'draft' }, now), 'draft')
  assert.equal(getAlertPhase({ status: 'scheduled' }, now), 'scheduled')
  assert.equal(getAlertPhase({ status: 'sent', sent_at: iso(-10) }, now), 'active')
  assert.equal(getAlertPhase({ status: 'sent', sent_at: iso(-10), expires_at: iso(-1) }, now), 'expired')
  assert.equal(getAlertPhase({ status: 'sent', sent_at: iso(-10), all_clear_at: iso(-2), expires_at: iso(-1) }, now), 'all_clear')
  assert.equal(getAlertPhase({ status: 'cancelled', sent_at: iso(-10) }, now), 'withdrawn')
  assert.equal(getAlertPhase({ status: 'cancelled' }, now), 'cancelled')
})

test('most urgent alerts sort first', () => {
  const sorted = sortAlertsByUrgency([
    { id: 'a', severity: 'info', sent_at: iso(-1) },
    { id: 'b', severity: 'critical', sent_at: iso(-30) },
    { id: 'c', severity: 'warning', sent_at: iso(-5) },
  ])
  assert.deepEqual(sorted.map((alert) => alert.id), ['b', 'c', 'a'])
})

test('sent alerts can only correct wording and area', () => {
  const { data } = normalizeSentAlertEdit({ ...base, severity: 'info', category: 'event', audience: 'all' })
  assert.deepEqual(Object.keys(data).sort(), ['affected_area', 'barangays', 'edited_after_send', 'message', 'title'])
  assert.equal(data.edited_after_send, true)
})

test('templates need a name and valid alert fields', () => {
  assert.match(normalizeTemplateInput({ ...base, name: '' }).error, /name/)
  assert.equal(normalizeTemplateInput({ ...base, name: 'Rain' }).data.name, 'Rain')
})

test('reach summary', () => {
  const reach = summarizeReach({ sent_at: iso(-5), push_sent: 40, push_failed: 2, push_completed_at: iso(-4) }, { delivered: 200, opened: 50 })
  assert.equal(reach.openRate, 25)
  assert.equal(reach.pushPending, false)
  assert.equal(summarizeReach({ sent_at: iso(-1) }, null).pushPending, true)
})

test('only known browser push services are accepted', () => {
  const keys = { p256dh: 'k', auth: 'a' }
  assert.ok(validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }))
  assert.ok(validatePushSubscription({ endpoint: 'https://web.push.apple.com/abc', keys }))
  assert.equal(validatePushSubscription({ endpoint: 'https://evil.example.com/hook', keys }), null)
  assert.equal(validatePushSubscription({ endpoint: 'http://fcm.googleapis.com/x', keys }), null)
  assert.equal(validatePushSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: {} }), null)
  assert.equal(validatePushSubscription(null), null)
})

test('authenticated and guest subscriptions share the push provider allowlist', () => {
  const signedInRoute = readFileSync(new URL('../app/(subsystems)/info/api/push-subscriptions/route.js', import.meta.url), 'utf8')
  const guestRoute = readFileSync(new URL('../app/(subsystems)/info/api/alerts/guest-subscription/route.js', import.meta.url), 'utf8')
  assert.match(signedInRoute, /validatePushSubscription\(body\?\.subscription\)/)
  assert.match(guestRoute, /validateSubscription\(body\?\.subscription\)/)
})

test('alerts are for tourism officers and admins only', () => {
  assert.equal(canAccessAdminPage('tourism_officer', '/info/admin/alerts'), true)
  assert.equal(canAccessAdminPage('moderator', '/info/admin/alerts'), false)
  assert.equal(canAccessAdminApi('tourism_officer', '/info/api/admin/alerts/templates', 'POST'), true)
  assert.equal(canAccessAdminApi('moderator', '/info/api/admin/alerts', 'GET'), false)
})

test('migration 098: delivery, privacy and secured push', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/098_realtime_alerts.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.alerts/)
  assert.match(sql, /deliver_alert/)
  assert.match(sql, /mark_alert_all_clear/)
  assert.match(sql, /cron\.schedule\('deliver-due-alerts'/)
  // A second call must not deliver twice.
  assert.match(sql, /IF v_alert\.status <> 'scheduled' THEN/)
  // Push webhook: secret from Vault, and no hard-coded JWT.
  assert.match(sql, /x-push-secret/)
  assert.match(sql, /vault\.decrypted_secrets/)
  assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}\./)
  // Public column grant matches what the client selects, and hides staff ids.
  const granted = sql.match(/GRANT SELECT \(([^)]+)\)\s+ON public\.alerts/)[1].split(',').map((column) => column.trim()).sort()
  assert.deepEqual(granted, PUBLIC_ALERT_COLUMNS.split(',').map((column) => column.trim()).sort())
  assert.ok(!granted.includes('created_by'))
})

test('push function refuses calls without the shared secret', () => {
  const source = readFileSync(new URL('../../supabase/functions/push/index.ts', import.meta.url), 'utf8')
  assert.match(source, /PUSH_WEBHOOK_SECRET/)
  assert.ok(source.indexOf('secretMatches(request.headers.get') < source.indexOf('await request.json()'))
  assert.doesNotMatch(source, /Access-Control-Allow-Origin/)
})
