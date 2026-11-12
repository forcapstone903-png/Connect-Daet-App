// Shared rules for real-time alerts (Phase 3). Used by the admin API
// (validation), the admin page (form options), the public alert pages and the
// site-wide banner. Delivery itself happens in the database
// (supabase/migrations/098_realtime_alerts.sql) and the push Edge Function.

import { DAET_BARANGAYS } from './listings.mjs'

export const ALERT_SEVERITIES = Object.freeze([
  { value: 'info', label: 'Information', hint: 'Good to know; no action needed', rank: 1 },
  { value: 'advisory', label: 'Advisory', hint: 'Plan ahead; some disruption expected', rank: 2 },
  { value: 'warning', label: 'Warning', hint: 'Take precautions now', rank: 3 },
  { value: 'critical', label: 'Emergency', hint: 'Immediate danger; act now', rank: 4 },
])

export const ALERT_SEVERITY_VALUES = Object.freeze(ALERT_SEVERITIES.map((item) => item.value))

export const ALERT_AUDIENCES = Object.freeze([
  { value: 'category', label: 'Subscribers of this category', hint: 'People who chose this category (and everyone who has not set preferences)' },
  { value: 'all', label: 'Everyone', hint: 'All registered users and guest devices, ignoring category choices' },
])

// Warning and emergency alerts are also shown in the site-wide banner.
export const BANNER_SEVERITIES = Object.freeze(['warning', 'critical'])

export const ALERT_LIMITS = Object.freeze({
  title: 120,
  message: 2000,
  area: 200,
  allClear: 1000,
  maxScheduleDays: 60,
  maxDurationDays: 30,
})

// Columns the public may read (matches the column grant in migration 098).
export const PUBLIC_ALERT_COLUMNS = 'id, title, message, category, severity, affected_area, barangays, status, sent_at, expires_at, cancelled_at, cancel_reason, all_clear_at, all_clear_message, edited_after_send, updated_at'

export function getSeverity(value) {
  return ALERT_SEVERITIES.find((item) => item.value === value) || ALERT_SEVERITIES[1]
}

/**
 * Where an alert is in its life cycle, for badges and filtering:
 * draft | scheduled | active | all_clear | expired | withdrawn | cancelled
 */
export function getAlertPhase(alert, now = new Date()) {
  if (!alert) return 'draft'
  if (alert.status === 'draft') return 'draft'
  if (alert.status === 'scheduled') return 'scheduled'
  if (alert.status === 'cancelled') return alert.sent_at ? 'withdrawn' : 'cancelled'
  if (alert.all_clear_at) return 'all_clear'
  if (alert.expires_at && new Date(alert.expires_at) <= now) return 'expired'
  return 'active'
}

export const ALERT_PHASE_LABELS = Object.freeze({
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  all_clear: 'All clear',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
})

export const isAlertCurrent = (alert, now = new Date()) => getAlertPhase(alert, now) === 'active'

/** Most urgent first, then newest. */
export function sortAlertsByUrgency(alerts) {
  return [...alerts].sort((a, b) => getSeverity(b.severity).rank - getSeverity(a.severity).rank
    || new Date(b.sent_at || 0) - new Date(a.sent_at || 0))
}

const clean = (value, max) => String(value ?? '').replace(/\s+\n/g, '\n').trim().slice(0, max)

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Validate an alert from the compose form.
 * body.delivery: 'draft' | 'now' | 'schedule'
 * Returns { data, delivery } or { error }.
 */
export function normalizeAlertInput(body = {}, { now = new Date(), categories = null } = {}) {
  const title = clean(body.title, ALERT_LIMITS.title + 1)
  const message = clean(body.message, ALERT_LIMITS.message + 1)
  const category = String(body.category || '').trim().toLowerCase()
  const severity = ALERT_SEVERITY_VALUES.includes(body.severity) ? body.severity : null
  const audience = ['all', 'category'].includes(body.audience) ? body.audience : 'category'
  const delivery = ['draft', 'now', 'schedule'].includes(body.delivery) ? body.delivery : 'draft'

  if (title.length < 3) return { error: 'Title must be at least 3 characters.' }
  if (title.length > ALERT_LIMITS.title) return { error: `Title must be ${ALERT_LIMITS.title} characters or fewer.` }
  if (message.length < 3) return { error: 'Message must be at least 3 characters.' }
  if (message.length > ALERT_LIMITS.message) return { error: `Message must be ${ALERT_LIMITS.message} characters or fewer.` }
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(category) || (categories && !categories.includes(category))) {
    return { error: 'Choose an alert category.' }
  }
  if (!severity) return { error: 'Choose a severity.' }

  const barangays = Array.isArray(body.barangays)
    ? [...new Set(body.barangays.filter((name) => DAET_BARANGAYS.includes(name)))]
    : []

  const scheduledFor = parseDate(body.scheduled_for)
  const expiresAt = parseDate(body.expires_at)
  if (scheduledFor === undefined) return { error: 'Scheduled time is not a valid date.' }
  if (expiresAt === undefined) return { error: 'End time is not a valid date.' }

  let sendAt = null
  if (delivery === 'schedule') {
    if (!scheduledFor) return { error: 'Choose when the alert should be sent.' }
    if (scheduledFor.getTime() < now.getTime() + 60_000) return { error: 'Scheduled time must be at least one minute from now.' }
    if (scheduledFor.getTime() > now.getTime() + ALERT_LIMITS.maxScheduleDays * 86_400_000) {
      return { error: `Alerts can be scheduled up to ${ALERT_LIMITS.maxScheduleDays} days ahead.` }
    }
    sendAt = scheduledFor
  } else if (delivery === 'now') {
    sendAt = now
  }

  if (expiresAt) {
    const from = sendAt || now
    if (expiresAt <= from) return { error: 'End time must be after the send time.' }
    if (expiresAt.getTime() > from.getTime() + ALERT_LIMITS.maxDurationDays * 86_400_000) {
      return { error: `An alert can stay active for up to ${ALERT_LIMITS.maxDurationDays} days.` }
    }
  }

  return {
    delivery,
    data: {
      title,
      message,
      category,
      severity,
      audience,
      affected_area: clean(body.affected_area, ALERT_LIMITS.area),
      barangays,
      status: delivery === 'draft' ? 'draft' : 'scheduled',
      scheduled_for: sendAt ? sendAt.toISOString() : null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      template_id: /^[0-9a-f-]{36}$/i.test(String(body.template_id || '')) ? body.template_id : null,
    },
  }
}

/** Fields that may still change after an alert has been sent (no re-send). */
export function normalizeSentAlertEdit(body = {}) {
  const title = clean(body.title, ALERT_LIMITS.title + 1)
  const message = clean(body.message, ALERT_LIMITS.message + 1)
  if (title.length < 3 || title.length > ALERT_LIMITS.title) return { error: 'Title must be 3 to 120 characters.' }
  if (message.length < 3 || message.length > ALERT_LIMITS.message) return { error: 'Message must be 3 to 2000 characters.' }
  return {
    data: {
      title,
      message,
      affected_area: clean(body.affected_area, ALERT_LIMITS.area),
      barangays: Array.isArray(body.barangays) ? [...new Set(body.barangays.filter((name) => DAET_BARANGAYS.includes(name)))] : [],
      edited_after_send: true,
    },
  }
}

export function normalizeTemplateInput(body = {}) {
  const name = clean(body.name, 81)
  if (name.length < 2 || name.length > 80) return { error: 'Template name must be 2 to 80 characters.' }
  const { data, error } = normalizeAlertInput({ ...body, delivery: 'draft' })
  if (error) return { error }
  return {
    data: {
      name,
      category: data.category,
      severity: data.severity,
      title: data.title,
      message: data.message,
      affected_area: data.affected_area,
    },
  }
}

/** Reach summary for a sent alert (inbox opens / inbox deliveries). */
export function summarizeReach(alert, reach) {
  const delivered = Number(reach?.delivered ?? alert?.recipients_inbox ?? 0)
  const opened = Number(reach?.opened ?? 0)
  return {
    delivered,
    opened,
    openRate: delivered ? Math.round((opened / delivered) * 100) : 0,
    pushSent: Number(alert?.push_sent || 0),
    pushFailed: Number(alert?.push_failed || 0),
    guestPushSent: Number(alert?.guest_push_sent || 0),
    pushPending: Boolean(alert?.sent_at && !alert?.push_completed_at),
  }
}
