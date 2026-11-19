import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

test('suspension expiration is cron-driven, idempotent, and preserves other account restrictions', () => {
  const migration = read('supabase', 'migrations', '143_automated_suspension_appeals.sql')
  const cron = read('src', 'app', '(subsystems)', 'info', 'api', 'cron', 'moderation-lifecycle', 'route.js')
  const vercel = read('vercel.json')

  assert.match(vercel, /"path": "\/info\/api\/cron\/moderation-lifecycle"[\s\S]*?"schedule": "0 2 \* \* \*"/)
  assert.match(cron, /timingSafeEqual/)
  assert.match(cron, /process_expired_account_suspensions/)
  assert.match(cron, /claim_moderation_email_outbox/)
  assert.match(migration, /ban\.expiration_processed_at IS NULL/)
  assert.match(migration, /investigation\.status = 'approved_suspension'/)
  assert.match(migration, /duration_change\.original_decision_id = decision\.id[\s\S]*?duration_change\.decision_type = 'SUSPENSION_DURATION_REDUCED'/)
  assert.match(migration, /WHEN bool_or\(other\.ban_type = 'permanent'\) THEN 'banned'/)
  assert.match(migration, /expiration_review_required_at = v_now/)
  assert.match(migration, /'suspension-expired-automatically'/)
})

test('banned appeals use rate-limited one-time hashed links and server-validated submissions', () => {
  const migration = read('supabase', 'migrations', '143_automated_suspension_appeals.sql')
  const appealApi = read('src', 'app', '(subsystems)', 'info', 'api', 'user', 'moderation-appeals', 'route.js')
  const publicPage = read('src', 'app', '(subsystems)', 'info', 'account-appeal', 'page.js')
  const proxy = read('src', 'proxy.js')
  const publicRoutes = read('src', 'lib', 'publicRoutes.js')

  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/)
  assert.match(migration, /account_appeal_access_rate_limits/)
  assert.match(migration, /attempt_count > 6/)
  assert.match(migration, /submit_user_moderation_appeal_v2/)
  assert.match(migration, /consumed_at IS NULL[\s\S]*?expires_at > v_now/)
  assert.match(appealApi, /createHash\('sha256'\)/)
  assert.match(appealApi, /account-appeal#token=/)
  assert.match(appealApi, /submit_user_moderation_appeal_v2/)
  assert.match(appealApi, /getServerSession\(request\)\?\.user_id/)
  assert.match(appealApi, /p_access_token_hash: accessTokenHash/)
  assert.match(appealApi, /If the case reference and registered email match/)
  assert.doesNotMatch(appealApi, /from\('account_appeal_access_requests'\)\s*\.insert/)
  assert.match(publicPage, /Email me a secure appeal link/)
  assert.match(publicRoutes, /\/info\/account-appeal/)
  assert.match(proxy, /AUTH_INDEPENDENT_API_PATHS[\s\S]*?\/info\/api\/user\/moderation-appeals/)
})

test('appeal review decisions record history and enforce active staff review through the database', () => {
  const migration = read('supabase', 'migrations', '143_automated_suspension_appeals.sql')
  const api = read('src', 'app', '(subsystems)', 'info', 'api', 'admin', 'moderation', 'route.js')
  const page = read('src', 'app', '(subsystems)', 'info', 'admin', 'moderation', 'page.js')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.moderation_appeal_reviews/)
  assert.match(migration, /An active authorized staff reviewer is required/)
  assert.match(migration, /The original decision-maker cannot review this appeal/)
  assert.match(migration, /Only a System Administrator can decide a permanent ban appeal/)
  assert.match(migration, /'more_information_required'/)
  assert.match(migration, /'reduce_suspension'/)
  assert.match(migration, /INSERT INTO public\.moderation_appeal_reviews/)
  assert.match(api, /review_user_moderation_appeal_v2/)
  assert.match(api, /'start_review', 'approve', 'reject', 'reduce_suspension', 'request_more_information'/)
  assert.match(page, /Start Review/)
  assert.match(page, /Reduce Duration/)
  assert.match(page, /Request Information/)
})

test('account decision emails use the durable queue and do not disclose investigation evidence', () => {
  const migration = read('supabase', 'migrations', '143_automated_suspension_appeals.sql')
  const cron = read('src', 'app', '(subsystems)', 'info', 'api', 'cron', 'moderation-lifecycle', 'route.js')
  const email = read('src', 'lib', 'moderatorReviewEmail.js')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.moderation_email_outbox/)
  assert.match(migration, /ON CONFLICT \(dedupe_key\) DO NOTHING/)
  assert.match(migration, /attempts < 8/)
  assert.match(cron, /finish_moderation_email_outbox/)
  assert.match(email, /Your Connect Daet Account Suspension Has Been Lifted/)
  assert.match(email, /including creating posts, commenting, reacting, and joining discussions/)
  assert.match(email, /Relevant community guideline:/)
  assert.match(email, /Applicable community guideline:/)
  assert.doesNotMatch(email, /evidence_paths|moderator assessment|internal staff notes/i)
})
