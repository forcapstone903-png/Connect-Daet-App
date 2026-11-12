import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'
import { sendAccountLifecycleEmail } from '@/lib/accountLifecycleEmail'
import { ASSIGNABLE_ROLES, STAFF_ROLE_LABELS, normalizePermissionOverrides, normalizeStaffRole } from '@/lib/staffRoles.mjs'
import { describePasswordPolicy, isPasswordValid } from '@/lib/passwordPolicy'
import { getPasswordPolicy } from '@/lib/appSettingsServer'
import { revokeUserSessions } from '@/lib/sessionVersions'
import { publicErrorMessage } from '@/lib/publicError'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const runtime = 'nodejs'

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for user administration.' },
    { status: 500 }
  )
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  try {
    const { data, error } = await adminSupabase
      .from('info_users')
      .select('id, email, full_name, user_type, status, profile_image_url, points, last_login, is_online, created_at, updated_at, deletion_scheduled_for')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Admin users fetch error:', error)
      return NextResponse.json({ success: false, message: publicErrorMessage(error) }, { status: 500 })
    }

    const { data: overrides, error: overridesError } = await adminSupabase
      .from('staff_permission_overrides')
      .select('user_id, permission, granted')
    if (overridesError && !['42P01', 'PGRST205'].includes(overridesError.code)) {
      console.error('Permission override list failed:', overridesError)
    }
    const overridesByUser = {}
    for (const row of overridesError ? [] : overrides || []) {
      const entry = overridesByUser[row.user_id] || (overridesByUser[row.user_id] = { grant: [], revoke: [] })
      entry[row.granted ? 'grant' : 'revoke'].push(row.permission)
    }

    return NextResponse.json({
      success: true,
      users: (data || []).map((user) => ({
        ...user,
        permission_overrides: overridesByUser[user.id] || { grant: [], revoke: [] },
      })),
    }, { headers: NO_STORE })
  } catch (error) {
    console.error('Admin users route error:', error)
    return NextResponse.json(
      { success: false, message: publicErrorMessage(error, 'Unable to load users right now.') },
      { status: 500 }
    )
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLE_ERRORS = {
  not_authorized: [403, 'Only an administrator can change roles.'],
  cannot_change_own_role: [409, 'You cannot change your own role.'],
  last_admin: [409, 'At least one active administrator must remain.'],
  user_not_found: [404, 'The selected account was not found.'],
  invalid_role: [400, 'That role is not supported.'],
}

function jsonError(status, message) {
  return NextResponse.json({ success: false, message }, { status, headers: NO_STORE })
}

async function readJsonBody(request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return { error: jsonError(403, 'Cross-origin requests are not allowed.') }
  }
  try {
    return { body: await request.json() }
  } catch {
    return { error: jsonError(400, 'A valid JSON request body is required.') }
  }
}

// Role changes go through admin_set_user_role (migration 096): it re-checks
// that the caller is an active admin, blocks self-demotion, keeps at least one
// admin, writes info_audit_log and revokes the target's sessions so the new
// role applies at their next sign-in.
async function setUserRole(adminUserId, targetUserId, role) {
  const { data, error } = await adminSupabase.rpc('admin_set_user_role', {
    p_admin_user_id: adminUserId,
    p_target_user_id: targetUserId,
    p_role: role,
  })
  if (!error) return { data }
  const match = Object.keys(ROLE_ERRORS).find((key) => String(error.message || '').includes(key))
  if (match) return { error: jsonError(...ROLE_ERRORS[match]) }
  console.error('Admin role change failed:', error)
  return { error: jsonError(500, 'Unable to change the role right now.') }
}

const roleName = (role) => STAFF_ROLE_LABELS[role] || role.charAt(0).toUpperCase() + role.slice(1)

// Create an account (tourist or staff). Administrator only (users.manage).
// The password is stored only by Supabase Auth, which hashes it; it is never
// written to info_users.
export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const fullName = String(body?.full_name || '').trim().slice(0, 120)
  const email = String(body?.email || '').trim().toLowerCase()
  const password = typeof body?.password === 'string' ? body.password : ''
  const role = String(body?.role || 'tourist').trim().toLowerCase()

  if (!fullName) return jsonError(400, 'Full name is required.')
  if (!EMAIL_PATTERN.test(email)) return jsonError(400, 'A valid email address is required.')
  const passwordPolicy = await getPasswordPolicy(adminSupabase)
  if (!isPasswordValid(password, passwordPolicy)) return jsonError(400, describePasswordPolicy(passwordPolicy))
  if (!ASSIGNABLE_ROLES.includes(role)) return jsonError(400, `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)

  const { data: created, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createError || !created?.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message || '')
    if (!duplicate) console.error('Admin account creation failed:', createError)
    return duplicate
      ? jsonError(409, 'An account with this email already exists.')
      : jsonError(500, 'Unable to create the account right now.')
  }

  const userId = created.user.id
  const now = new Date().toISOString()
  const { error: profileError } = await adminSupabase.from('info_users').insert({
    id: userId,
    email,
    full_name: fullName,
    user_type: 'tourist',
    status: 'active',
    email_verified: true,
    created_at: now,
    updated_at: now,
  })
  if (profileError) {
    console.error('Admin account profile creation failed:', profileError)
    await adminSupabase.auth.admin.deleteUser(userId).catch(() => {})
    return jsonError(500, 'Unable to create the account profile right now.')
  }

  await adminSupabase.from('info_audit_log').insert({
    user_id: session.user_id,
    action: 'account_created',
    table_name: 'info_users',
    record_id: userId,
    changes: { email, role },
  })

  if (role !== 'tourist') {
    const { error: roleError } = await setUserRole(session.user_id, userId, role)
    if (roleError) return roleError
  }

  return NextResponse.json(
    { success: true, user: { id: userId, email, full_name: fullName, user_type: role }, message: `${roleName(role)} account created.` },
    { status: 201, headers: NO_STORE }
  )
}

const USER_STATUSES = ['active', 'pending', 'suspended', 'banned']
const STAFF_OVERRIDE_ROLES = ['tourism_officer', 'moderator']

async function audit(actorId, action, targetUserId, changes = {}) {
  const { error } = await adminSupabase.from('info_audit_log').insert({
    user_id: actorId,
    action,
    table_name: 'info_users',
    record_id: targetUserId,
    changes,
  })
  if (error) console.error('Admin user audit failed:', { action, code: error.code || null })
}

async function revokeQuietly(targetUserId) {
  try {
    await revokeUserSessions(adminSupabase, targetUserId)
  } catch (revokeError) {
    console.error('Session revocation failed:', revokeError)
  }
}

// Update an account. Administrator only (users.manage).
// Body: { userId, full_name?, email?, status?, points?, role?, password?, permissions?: { grant, revoke } }
// Profile fields, role, password and permissions are all optional; changes
// that affect access (role, password, status, permissions) sign the user out.
export async function PATCH(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const { body, error: bodyError } = await readJsonBody(request)
  if (bodyError) return bodyError

  const targetUserId = typeof body?.userId === 'string' ? body.userId : ''
  if (!UUID_PATTERN.test(targetUserId)) return jsonError(400, 'A valid user ID is required.')

  const { data: target, error: targetError } = await adminSupabase
    .from('info_users')
    .select('id, email, full_name, user_type, status, points')
    .eq('id', targetUserId)
    .maybeSingle()
  if (targetError) {
    console.error('Admin user lookup failed:', targetError)
    return jsonError(500, 'Unable to load the selected account.')
  }
  if (!target) return jsonError(404, 'The selected account was not found.')

  const isSelf = targetUserId === session.user_id
  const role = typeof body?.role === 'string' ? body.role.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const fullName = body?.full_name === undefined ? null : String(body.full_name).trim().slice(0, 120)
  const email = body?.email === undefined ? null : String(body.email).trim().toLowerCase()
  const status = body?.status === undefined ? null : String(body.status)
  const points = body?.points === undefined ? null : Number(body.points)
  const permissions = body?.permissions === undefined ? null : normalizePermissionOverrides(body.permissions)

  if (role && !ASSIGNABLE_ROLES.includes(role)) return jsonError(400, `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}.`)
  const passwordPolicy = password ? await getPasswordPolicy(adminSupabase) : null
  if (password && !isPasswordValid(password, passwordPolicy)) return jsonError(400, describePasswordPolicy(passwordPolicy))
  if (fullName !== null && !fullName) return jsonError(400, 'Full name is required.')
  if (email !== null && !EMAIL_PATTERN.test(email)) return jsonError(400, 'A valid email address is required.')
  if (status !== null && !USER_STATUSES.includes(status)) return jsonError(400, `Status must be one of: ${USER_STATUSES.join(', ')}.`)
  if (status !== null && isSelf && status !== target.status) return jsonError(409, 'You cannot change the status of your own account.')
  if (points !== null && (!Number.isInteger(points) || points < 0 || points > 10_000_000)) return jsonError(400, 'Points must be a whole number of 0 or more.')

  const finalRole = role || normalizeStaffRole(target.user_type)
  if (permissions && (permissions.grant.length || permissions.revoke.length) && !STAFF_OVERRIDE_ROLES.includes(finalRole)) {
    return jsonError(400, 'Custom permissions apply only to Tourism Officer and Moderator accounts.')
  }

  const messages = []
  let accessChanged = false

  if (email !== null && email !== String(target.email || '').toLowerCase()) {
    const { error } = await adminSupabase.auth.admin.updateUserById(targetUserId, { email, email_confirm: true })
    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message || '')
      if (!duplicate) console.error('Admin email change failed:', error)
      return duplicate
        ? jsonError(409, 'Another account already uses this email address.')
        : jsonError(500, 'Unable to change the sign-in email right now.')
    }
    messages.push('Sign-in email updated.')
  }

  const profileUpdate = {}
  if (fullName !== null && fullName !== target.full_name) profileUpdate.full_name = fullName
  if (email !== null && email !== String(target.email || '').toLowerCase()) profileUpdate.email = email
  if (status !== null && status !== target.status) profileUpdate.status = status
  if (points !== null && points !== Number(target.points || 0)) profileUpdate.points = points
  if (Object.keys(profileUpdate).length) {
    const { error } = await adminSupabase
      .from('info_users')
      .update({ ...profileUpdate, updated_at: new Date().toISOString() })
      .eq('id', targetUserId)
    if (error) {
      console.error('Admin profile update failed:', error)
      return jsonError(500, 'Unable to save the account details right now.')
    }
    await audit(session.user_id, 'account_updated_by_admin', targetUserId, {
      fields: Object.keys(profileUpdate).sort(),
      ...(profileUpdate.status ? { status: { from: target.status, to: profileUpdate.status } } : {}),
    })
    if (profileUpdate.status && profileUpdate.status !== 'active') accessChanged = true
    if (!messages.length) messages.push('Account details saved.')
  }

  let user = null
  if (role && role !== normalizeStaffRole(target.user_type)) {
    const { data, error } = await setUserRole(session.user_id, targetUserId, role)
    if (error) return error
    user = data
    if (data?.changed !== false) messages.push(`Role updated to ${roleName(role)}.`)
    // Overrides belong to the previous role; start clean for the new one.
    if (!permissions) {
      const { error: clearError } = await adminSupabase.from('staff_permission_overrides').delete().eq('user_id', targetUserId)
      if (clearError && !['42P01', 'PGRST205'].includes(clearError.code)) console.error('Permission override reset failed:', clearError)
    }
  }

  if (permissions) {
    const { data: existing, error: existingError } = await adminSupabase
      .from('staff_permission_overrides')
      .select('permission, granted')
      .eq('user_id', targetUserId)
    if (existingError) {
      console.error('Permission override lookup failed:', existingError)
      return jsonError(500, 'Unable to load custom permissions. Has migration 102 been applied?')
    }
    const before = normalizePermissionOverrides({
      grant: (existing || []).filter((row) => row.granted).map((row) => row.permission),
      revoke: (existing || []).filter((row) => !row.granted).map((row) => row.permission),
    })
    if (JSON.stringify(before) !== JSON.stringify(permissions)) {
      const { error: deleteError } = await adminSupabase.from('staff_permission_overrides').delete().eq('user_id', targetUserId)
      if (deleteError) {
        console.error('Permission override reset failed:', deleteError)
        return jsonError(500, 'Unable to save custom permissions.')
      }
      const rows = [
        ...permissions.grant.map((permission) => ({ user_id: targetUserId, permission, granted: true, updated_by: session.user_id })),
        ...permissions.revoke.map((permission) => ({ user_id: targetUserId, permission, granted: false, updated_by: session.user_id })),
      ]
      if (rows.length) {
        const { error: insertError } = await adminSupabase.from('staff_permission_overrides').insert(rows)
        if (insertError) {
          console.error('Permission override save failed:', insertError)
          return jsonError(500, 'Unable to save custom permissions.')
        }
      }
      await audit(session.user_id, 'permissions_changed', targetUserId, { before, after: permissions })
      accessChanged = true
      messages.push('Permissions updated.')
    }
  }

  if (password) {
    const { error } = await adminSupabase.auth.admin.updateUserById(targetUserId, { password })
    if (error) {
      console.error('Admin password reset failed:', error)
      return jsonError(500, 'Unable to reset the password right now.')
    }
    await audit(session.user_id, 'password_reset_by_admin', targetUserId)
    accessChanged = true
    messages.push('Password reset.')
  }

  if (accessChanged) await revokeQuietly(targetUserId)

  return NextResponse.json(
    {
      success: true,
      user,
      message: messages.length
        ? `${messages.join(' ')}${accessChanged || role ? ' The user must sign in again.' : ''}`
        : 'No changes were needed.',
    },
    { headers: NO_STORE }
  )
}

export async function DELETE(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { success: false, message: 'Cross-origin requests are not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, message: 'A valid JSON request body is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    const targetUserId = typeof body?.userId === 'string' ? body.userId : ''
    if (!UUID_PATTERN.test(targetUserId)) {
      return NextResponse.json(
        { success: false, message: 'A valid user ID is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { data: target, error: targetError } = await adminSupabase
      .from('info_users')
      .select('id, email, user_type, status, deletion_requested_at, deletion_scheduled_for')
      .eq('id', targetUserId)
      .maybeSingle()

    if (targetError) {
      console.error('Admin account deletion lookup failed:', targetError)
      return NextResponse.json(
        { success: false, message: 'Unable to verify the selected account.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (!target) {
      return NextResponse.json(
        { success: false, message: 'The selected account was not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (['admin', 'administrator', 'tourism_officer', 'moderator'].includes(String(target.user_type).toLowerCase())) {
      return NextResponse.json(
        { success: false, message: 'Staff accounts cannot be deleted here. Change the role to tourist first.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (target.status === 'pending_deletion' || target.deletion_requested_at || target.deletion_scheduled_for) {
      return NextResponse.json(
        { success: false, message: 'This account already has a deletion scheduled.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const { data: schedule, error: scheduleError } = await adminSupabase.rpc(
      'schedule_admin_account_deletion',
      { p_admin_user_id: session.user_id, p_target_user_id: targetUserId }
    )
    if (scheduleError) {
      console.error('Admin account deletion scheduling failed:', scheduleError)
      return NextResponse.json(
        { success: false, message: 'Unable to schedule account deletion right now.' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    if (!schedule) {
      return NextResponse.json(
        { success: false, message: 'The account could not be scheduled for deletion. Refresh and try again.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    let emailNotificationSent = false
    if (target.email) {
      try {
        const emailResult = await sendAccountLifecycleEmail(
          target.email,
          'requested',
          schedule.scheduled_for,
          { gracePeriodDays: 15 }
        )
        emailNotificationSent = emailResult.sent
      } catch (emailError) {
        console.error('Admin deletion notification failed:', emailError)
      }
    }

    return NextResponse.json(
      {
        success: true,
        scheduledFor: schedule.scheduled_for,
        emailNotificationSent,
        message: 'Account access has been revoked and permanent deletion is scheduled after a 15-day grace period.',
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Admin account deletion route error:', error)
    return NextResponse.json(
      { success: false, message: 'Unable to schedule account deletion right now.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
