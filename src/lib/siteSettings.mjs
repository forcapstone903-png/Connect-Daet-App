// Schema for every row in admin_app_settings. The admin settings API
// (PUT /info/api/admin/settings) stores only what normalizeSetting returns,
// and server code reads settings through these defaults, so a missing or
// partial row always resolves to a complete, valid object.

export const SETTING_IDS = Object.freeze([
  'general', 'security', 'notifications', 'email', 'messaging', 'moderation', 'announcement',
])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const DEFAULT_GENERAL_SETTINGS = Object.freeze({
  site_name: 'Connect Daet',
  tagline: 'Tourism information and real-time alerts for Daet, Camarines Norte',
  logo_url: '',
  tourism_office_name: 'Daet Municipal Tourism Office',
  contact_email: 'tourism@daet.gov.ph',
  contact_phone: '',
  emergency_hotline: '',
  office_address: '',
  office_hours: '',
  facebook_url: '',
  website_url: '',
  municipality_name: 'Daet',
  province: 'Camarines Norte',
  region: 'Bicol Region (Region V)',
  municipality_description: '',
  timezone: 'Asia/Manila',
  language: 'English',
  date_format: 'MM/DD/YYYY',
})

export const DEFAULT_SECURITY_SETTINGS = Object.freeze({
  password_min_length: 8,
  password_require_lowercase: true,
  password_require_uppercase: true,
  password_require_number: true,
  password_require_symbol: true,
  session_hours: 24,
  remember_days: 30,
  idle_timeout_minutes: 0,
  lockout_max_attempts: 5,
  lockout_window_minutes: 15,
  lockout_duration_minutes: 15,
})

export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  alert_push_enabled: true,
  general_push_enabled: true,
  follower_notifications_enabled: true,
})

export const DEFAULT_EMAIL_SETTINGS = Object.freeze({
  sender_name: 'Connect Daet',
  reply_to: '',
  footer_text: '',
  security_emails_enabled: true,
  event_reminder_emails_enabled: true,
})

export const DEFAULT_MESSAGING_SETTINGS = Object.freeze({ templates: [] })

const DEFAULTS = {
  general: DEFAULT_GENERAL_SETTINGS,
  security: DEFAULT_SECURITY_SETTINGS,
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
  email: DEFAULT_EMAIL_SETTINGS,
  messaging: DEFAULT_MESSAGING_SETTINGS,
}

const text = (value, max) => String(value ?? '').trim().slice(0, max)

function url(value, label) {
  const raw = text(value, 500)
  if (!raw) return { value: '' }
  if (raw.startsWith('/') && !raw.startsWith('//')) return { value: raw }
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return { error: `${label} must start with https://.` }
    return { value: parsed.toString() }
  } catch {
    return { error: `${label} must be a valid web address.` }
  }
}

function integer(value, { min, max, fallback, allowZero = false }) {
  const number = Number(value)
  if (!Number.isInteger(number)) return fallback
  if (allowZero && number === 0) return 0
  return Math.min(Math.max(number, min), max)
}

const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback)

function normalizeGeneral(input) {
  const value = {
    site_name: text(input.site_name, 120),
    tagline: text(input.tagline, 160),
    tourism_office_name: text(input.tourism_office_name, 120),
    contact_email: text(input.contact_email, 254).toLowerCase(),
    contact_phone: text(input.contact_phone, 40),
    emergency_hotline: text(input.emergency_hotline, 40),
    office_address: text(input.office_address, 300),
    office_hours: text(input.office_hours, 200),
    municipality_name: text(input.municipality_name, 80),
    province: text(input.province, 80),
    region: text(input.region, 80),
    municipality_description: text(input.municipality_description, 4000),
    timezone: ['Asia/Manila', 'UTC'].includes(input.timezone) ? input.timezone : DEFAULT_GENERAL_SETTINGS.timezone,
    language: ['English', 'Filipino'].includes(input.language) ? input.language : DEFAULT_GENERAL_SETTINGS.language,
    date_format: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(input.date_format)
      ? input.date_format
      : DEFAULT_GENERAL_SETTINGS.date_format,
  }
  if (!value.site_name) return { error: 'Site name is required.' }
  if (!value.municipality_name) return { error: 'Municipality name is required.' }
  if (value.contact_email && !EMAIL_PATTERN.test(value.contact_email)) return { error: 'Contact email is not valid.' }
  if (value.contact_phone && !/^[0-9+()\-\s]{3,40}$/.test(value.contact_phone)) return { error: 'Contact phone may contain only digits, spaces, +, ( ) and -.' }
  if (value.emergency_hotline && !/^[0-9+()\-\s]{3,40}$/.test(value.emergency_hotline)) return { error: 'Emergency hotline may contain only digits, spaces, +, ( ) and -.' }

  for (const [field, label] of [['logo_url', 'Logo'], ['facebook_url', 'Facebook page'], ['website_url', 'Website']]) {
    const result = url(input[field], label)
    if (result.error) return { error: result.error }
    value[field] = result.value
  }
  return { value }
}

function normalizeSecurity(input) {
  const d = DEFAULT_SECURITY_SETTINGS
  return {
    value: {
      password_min_length: integer(input.password_min_length, { min: 8, max: 64, fallback: d.password_min_length }),
      password_require_lowercase: flag(input.password_require_lowercase, d.password_require_lowercase),
      password_require_uppercase: flag(input.password_require_uppercase, d.password_require_uppercase),
      password_require_number: flag(input.password_require_number, d.password_require_number),
      password_require_symbol: flag(input.password_require_symbol, d.password_require_symbol),
      session_hours: integer(input.session_hours, { min: 1, max: 168, fallback: d.session_hours }),
      remember_days: integer(input.remember_days, { min: 1, max: 90, fallback: d.remember_days }),
      idle_timeout_minutes: integer(input.idle_timeout_minutes, { min: 5, max: 1440, fallback: d.idle_timeout_minutes, allowZero: true }),
      lockout_max_attempts: integer(input.lockout_max_attempts, { min: 3, max: 20, fallback: d.lockout_max_attempts }),
      lockout_window_minutes: integer(input.lockout_window_minutes, { min: 5, max: 120, fallback: d.lockout_window_minutes }),
      lockout_duration_minutes: integer(input.lockout_duration_minutes, { min: 5, max: 1440, fallback: d.lockout_duration_minutes }),
    },
  }
}

function normalizeNotifications(input) {
  const d = DEFAULT_NOTIFICATION_SETTINGS
  return {
    value: {
      alert_push_enabled: flag(input.alert_push_enabled, d.alert_push_enabled),
      general_push_enabled: flag(input.general_push_enabled, d.general_push_enabled),
      follower_notifications_enabled: flag(input.follower_notifications_enabled, d.follower_notifications_enabled),
    },
  }
}

function normalizeEmail(input) {
  const d = DEFAULT_EMAIL_SETTINGS
  const value = {
    sender_name: text(input.sender_name, 80).replace(/[<>"\r\n]/g, '') || d.sender_name,
    reply_to: text(input.reply_to, 254).toLowerCase(),
    footer_text: text(input.footer_text, 500),
    security_emails_enabled: flag(input.security_emails_enabled, d.security_emails_enabled),
    event_reminder_emails_enabled: flag(input.event_reminder_emails_enabled, d.event_reminder_emails_enabled),
  }
  if (value.reply_to && !EMAIL_PATTERN.test(value.reply_to)) return { error: 'Reply-to address is not valid.' }
  return { value }
}

function normalizeMessaging(input) {
  const templates = Array.isArray(input.templates) ? input.templates : []
  if (templates.length > 50) return { error: 'Keep 50 message templates or fewer.' }
  const cleaned = []
  for (const template of templates) {
    const item = {
      id: text(template?.id, 64),
      name: text(template?.name, 80),
      category: text(template?.category, 40),
      subject: text(template?.subject, 150),
      body: text(template?.body, 5000),
    }
    if (!item.id || !item.name || !item.body) return { error: 'Each template needs a name and a message body.' }
    cleaned.push(item)
  }
  return { value: { templates: cleaned } }
}

const NORMALIZERS = {
  general: normalizeGeneral,
  security: normalizeSecurity,
  notifications: normalizeNotifications,
  email: normalizeEmail,
  messaging: normalizeMessaging,
}

/** Validate an admin settings write. Returns { value } or { error }. */
export function normalizeSetting(id, input) {
  if (!SETTING_IDS.includes(id)) return { error: 'A supported settings key is required.' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Settings must be an object.' }
  const normalize = NORMALIZERS[id]
  return normalize ? normalize(input) : { value: input }
}

/** A stored row merged over its defaults (unknown keys dropped). */
export function resolveSetting(id, stored) {
  const defaults = DEFAULTS[id]
  if (!defaults) return stored && typeof stored === 'object' ? stored : {}
  const merged = { ...defaults }
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(defaults)) {
      if (stored[key] !== undefined && stored[key] !== null) merged[key] = stored[key]
    }
  }
  return merged
}

export function passwordPolicyFromSecurity(security) {
  const s = resolveSetting('security', security)
  return {
    minLength: s.password_min_length,
    requireLowercase: s.password_require_lowercase,
    requireUppercase: s.password_require_uppercase,
    requireNumber: s.password_require_number,
    requireSymbol: s.password_require_symbol,
  }
}

/** The only settings any visitor may read (Contact, About, branding, password rules). */
export function buildPublicSettings({ general, security } = {}) {
  const g = resolveSetting('general', general)
  return {
    siteName: g.site_name,
    tagline: g.tagline,
    logoUrl: g.logo_url,
    tourismOfficeName: g.tourism_office_name,
    contact: {
      email: g.contact_email,
      phone: g.contact_phone,
      emergencyHotline: g.emergency_hotline,
      address: g.office_address,
      officeHours: g.office_hours,
      facebookUrl: g.facebook_url,
      websiteUrl: g.website_url,
    },
    municipality: {
      name: g.municipality_name,
      province: g.province,
      region: g.region,
      description: g.municipality_description,
    },
    passwordPolicy: passwordPolicyFromSecurity(security),
  }
}
