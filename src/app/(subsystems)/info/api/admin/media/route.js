import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'post-media'
const ADMIN_MEDIA_PREFIX = 'admin-library/'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null
}

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function toMediaFile(row, client) {
  const fileName = row.object_path.split('/').pop()
  const { data } = client.storage.from(BUCKET).getPublicUrl(row.object_path)
  return {
    objectPath: row.object_path,
    name: fileName,
    type: row.content_type || 'application/octet-stream',
    size: row.file_size,
    uploadedAt: row.created_at,
    url: data.publicUrl,
  }
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Media storage is not configured.' }, 503)

  const { data, error } = await client
    .from('user_storage_objects')
    .select('object_path, content_type, file_size, created_at')
    .eq('bucket_id', BUCKET)
    .like('object_path', `${ADMIN_MEDIA_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('Admin media listing failed:', { code: error.code || null })
    return response({ success: false, message: 'Unable to load uploaded media.' }, 503)
  }

  return response({ success: true, files: (data || []).map((row) => toMediaFile(row, client)) })
}

export async function POST(request) {
  const { session, response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Media storage is not configured.' }, 503)

  let formData
  try {
    formData = await request.formData()
  } catch {
    return response({ success: false, message: 'Upload must use multipart form data.' }, 400)
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return response({ success: false, message: 'Choose a file to upload.' }, 400)
  }
  if (!ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return response({ success: false, message: 'Use a supported image or video file up to 20 MB.' }, 400)
  }

  const safeName = file.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-120) || 'upload'
  const objectPath = `${ADMIN_MEDIA_PREFIX}${session.user_id}/${randomUUID()}-${safeName}`
  const { error: uploadError } = await client.storage.from(BUCKET).upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  })

  if (uploadError) {
    console.error('Admin media upload failed:', { code: uploadError.code || null })
    return response({ success: false, message: 'Unable to upload this file to durable storage.' }, 503)
  }

  const { error: recordError } = await client.from('user_storage_objects').upsert({
    user_id: session.user_id,
    bucket_id: BUCKET,
    object_path: objectPath,
    file_size: file.size,
    content_type: file.type,
  }, { onConflict: 'bucket_id,object_path' })

  if (recordError) {
    const { error: cleanupError } = await client.storage.from(BUCKET).remove([objectPath])
    console.error('Admin media ownership record failed:', {
      code: recordError.code || null,
      cleanupCode: cleanupError?.code || null,
    })
    return response({ success: false, message: 'The upload could not be securely recorded; the object was not retained.' }, 503)
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(objectPath)
  return response({
    success: true,
    file: { objectPath, name: safeName, type: file.type, size: file.size, uploadedAt: new Date().toISOString(), url: data.publicUrl },
  }, 201)
}

export async function DELETE(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  const client = getAdminClient()
  if (!client) return response({ success: false, message: 'Media storage is not configured.' }, 503)

  let objectPath
  try {
    objectPath = (await request.json()).objectPath
  } catch {
    return response({ success: false, message: 'Request body must be valid JSON.' }, 400)
  }

  if (
    typeof objectPath !== 'string'
    || !objectPath.startsWith(ADMIN_MEDIA_PREFIX)
    || objectPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return response({ success: false, message: 'Invalid media object path.' }, 400)
  }

  const { data: record, error: lookupError } = await client
    .from('user_storage_objects')
    .select('object_path')
    .eq('bucket_id', BUCKET)
    .eq('object_path', objectPath)
    .maybeSingle()
  if (lookupError) {
    console.error('Admin media ownership lookup failed:', { code: lookupError.code || null })
    return response({ success: false, message: 'Unable to verify media ownership.' }, 503)
  }
  if (!record) return response({ success: false, message: 'Media object was not found.' }, 404)

  const { error: removeError } = await client.storage.from(BUCKET).remove([objectPath])
  if (removeError) {
    console.error('Admin media delete failed:', { code: removeError.code || null })
    return response({ success: false, message: 'Unable to remove the media object.' }, 503)
  }

  const { error: recordDeleteError } = await client
    .from('user_storage_objects')
    .delete()
    .eq('bucket_id', BUCKET)
    .eq('object_path', objectPath)
  if (recordDeleteError) {
    console.error('Admin media tracking cleanup failed:', { code: recordDeleteError.code || null })
    return response({ success: false, message: 'The media object was removed, but its storage record could not be cleared.' }, 503)
  }

  return response({ success: true })
}
