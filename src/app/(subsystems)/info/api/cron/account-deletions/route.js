import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendAccountLifecycleEmail } from '@/lib/accountLifecycleEmail'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const USER_STORAGE_BUCKETS = ['profile-media', 'post-media', 'blogs']
const USER_STORAGE_PREFIXES = [
  'users',
  'covers',
  'blog-media',
  'images',
  'videos',
  'feedback',
  'featured',
  'gallery',
  'messages',
  'forum-replies',
  'forum-attachments',
  'posts',
]

function isAuthorized(request) {
  const expected = process.env.CRON_SECRET?.trim() || ''
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (Buffer.byteLength(expected) < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(expected)) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

async function removePrefixObjects(storage, bucket, prefix) {
  const objects = []
  const pending = [prefix]

  while (pending.length) {
    const current = pending.pop()
    let offset = 0
    while (true) {
      const { data, error } = await storage.from(bucket).list(current, { limit: 1000, offset })
      if (error?.statusCode === '404' || error?.statusCode === 404) return
      if (error) throw error
      if (!data?.length) break

      for (const item of data) {
        const path = `${current}/${item.name}`
        if (item.id === null) pending.push(path)
        else objects.push(path)
      }

      if (data.length < 1000) break
      offset += data.length
    }
  }

  for (let index = 0; index < objects.length; index += 100) {
    const { error } = await storage.from(bucket).remove(objects.slice(index, index + 100))
    if (error) throw error
  }
}

async function removeUserStorage(adminSupabase, userId) {
  const { data: tracked, error: trackedError } = await adminSupabase
    .from('user_storage_objects')
    .select('bucket_id, object_path')
    .eq('user_id', userId)
  if (trackedError) throw trackedError

  const storage = adminSupabase.storage
  const grouped = new Map()
  for (const object of tracked || []) {
    if (!grouped.has(object.bucket_id)) grouped.set(object.bucket_id, [])
    grouped.get(object.bucket_id).push(object.object_path)
  }

  for (const [bucket, paths] of grouped) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await storage.from(bucket).remove(paths.slice(index, index + 100))
      if (error?.statusCode === '404' || error?.statusCode === 404) continue
      if (error) throw error
    }
  }

  for (const bucket of USER_STORAGE_BUCKETS) {
    for (const folder of USER_STORAGE_PREFIXES) {
      await removePrefixObjects(storage, bucket, `${folder}/${userId}`)
    }
  }
}

async function claimExpiredDeletion(adminSupabase, userId) {
  const { data, error } = await adminSupabase.rpc('claim_expired_account_deletion', {
    p_user_id: userId,
  })
  if (error) throw error
  return data === true
}

async function processExpiredAccounts(adminSupabase) {
  const { data: dueAccounts, error } = await adminSupabase
    .from('info_users')
    .select('id, email')
    .eq('status', 'pending_deletion')
    .lte('deletion_scheduled_for', new Date().toISOString())
    .not('deletion_requested_at', 'is', null)
    .order('deletion_scheduled_for', { ascending: true })
    .limit(100)
  if (error) throw error

  let deleted = 0
  let failed = 0
  for (const account of dueAccounts || []) {
    let claimed = false
    try {
      claimed = await claimExpiredDeletion(adminSupabase, account.id)
      if (!claimed) continue

      await removeUserStorage(adminSupabase, account.id)

      const { data: authUser, error: authLookupError } = await adminSupabase.auth.admin.getUserById(account.id)
      const userNotFound = authLookupError?.status === 404 || authLookupError?.code === 'user_not_found'
      if (authLookupError && !userNotFound) throw authLookupError
      if (authUser?.user) {
        const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(account.id)
        if (authDeleteError) throw authDeleteError
      }

      const { error: profileDeleteError } = await adminSupabase
        .from('info_users')
        .delete()
        .eq('id', account.id)
        .eq('status', 'pending_deletion')
        .lte('deletion_scheduled_for', new Date().toISOString())
      if (profileDeleteError) throw profileDeleteError

      if (account.email) await sendAccountLifecycleEmail(account.email, 'deleted')
      deleted += 1
    } catch (error) {
      failed += 1
      console.error('Scheduled account deletion failed:', {
        userId: account.id,
        code: error.code || null,
        status: error.status || null,
      })
      if (claimed) {
        const { error: releaseError } = await adminSupabase.rpc('release_expired_account_deletion', {
          p_user_id: account.id,
        })
        if (releaseError) {
          console.error('Account deletion claim release failed:', {
            userId: account.id,
            code: releaseError.code || null,
          })
        }
      }
    }
  }

  return { selected: dueAccounts?.length || 0, deleted, failed }
}

async function processReminders(adminSupabase) {
  const { data: reminders, error } = await adminSupabase.rpc('claim_account_deletion_reminders', {
    p_limit: 100,
  })
  if (error) throw error

  let sent = 0
  let failed = 0
  for (const reminder of reminders || []) {
    const event = reminder.reminder_days === 7 ? 'reminder7' : 'reminder1'
    let deliverySucceeded = false
    try {
      const result = await sendAccountLifecycleEmail(reminder.email, event, reminder.deletion_scheduled_for)
      deliverySucceeded = result.sent
      if (deliverySucceeded) sent += 1
      else failed += 1
    } catch (error) {
      failed += 1
      console.error('Account deletion reminder failed:', {
        userId: reminder.user_id,
        days: reminder.reminder_days,
        code: error.code || null,
      })
    }

    const { error: finishError } = await adminSupabase.rpc('finish_account_deletion_reminder', {
      p_user_id: reminder.user_id,
      p_reminder_days: reminder.reminder_days,
      p_sent: deliverySucceeded,
    })
    if (finishError) {
      console.error('Account deletion reminder state update failed:', {
        userId: reminder.user_id,
        days: reminder.reminder_days,
        code: finishError.code || null,
      })
    }
  }
  return { selected: reminders?.length || 0, sent, failed }
}

export async function GET(request) {
  if (!isAuthorized(request)) return response({ success: false, message: 'Unauthorized.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account deletion job is not configured.')
    return response({ success: false, message: 'Account deletion job is not configured.' }, 503)
  }

  const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  try {
    const reminders = await processReminders(adminSupabase)
    const deletions = await processExpiredAccounts(adminSupabase)
    return response({ success: true, reminders, deletions })
  } catch (error) {
    console.error('Account lifecycle scheduled job failed:', {
      code: error.code || null,
      status: error.status || null,
    })
    return response({ success: false, message: 'Account lifecycle job failed.' }, 500)
  }
}
