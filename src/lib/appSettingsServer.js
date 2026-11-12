import { createClient } from '@supabase/supabase-js'
import { passwordPolicyFromSecurity, resolveSetting } from './siteSettings.mjs'

// Per-server-instance cache of admin_app_settings rows. Settings change
// rarely and several are read on every login, so rows are kept for 30 s.
// The settings API calls invalidateAppSettings() after a successful write, so
// the instance that saved sees the change at once; other instances within
// 30 s. Values are non-secret configuration (no credentials are stored here).
const TTL_MS = 30_000
const cache = new Map()

let serviceClient = null
export function getSettingsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  if (!serviceClient) {
    serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  }
  return serviceClient
}

export function invalidateAppSettings(id) {
  if (id) cache.delete(id)
  else cache.clear()
}

/**
 * Resolved settings for one id. A failed read falls back to the defaults
 * (which equal the behaviour before settings were configurable) and is not
 * cached, so the next request retries.
 */
export async function getAppSetting(id, client = getSettingsClient()) {
  const hit = cache.get(id)
  if (hit && hit.expiresAt > Date.now()) return hit.value
  if (!client) return resolveSetting(id, null)

  const { data, error } = await client
    .from('admin_app_settings')
    .select('value')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('App setting load failed:', { id, code: error.code || null })
    return resolveSetting(id, null)
  }
  const value = resolveSetting(id, data?.value)
  cache.set(id, { value, expiresAt: Date.now() + TTL_MS })
  return value
}

export async function getPasswordPolicy(client) {
  return passwordPolicyFromSecurity(await getAppSetting('security', client))
}
