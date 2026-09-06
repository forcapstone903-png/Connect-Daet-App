import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from '@/lib/serverAuth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request) {
  try {
    const userId = getServerSession(request)?.user_id
    if (!userId) return NextResponse.json({ error: 'User session is required.' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file')
    const requestedBucket = String(formData.get('bucket') || '')
    const requestedFolder = String(formData.get('folder') || '')
    const bucket = requestedBucket === 'profile-media' ? requestedBucket : null
    const folderType = requestedFolder.startsWith('covers/') ? 'covers' : requestedFolder.startsWith('users/') ? 'users' : null
    const folder = folderType ? `${folderType}/${userId}` : null

    if (!bucket || !folder) return NextResponse.json({ error: 'Invalid upload destination.' }, { status: 400 })

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 })
    }

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
    if (!allowedTypes.has(file.type) || file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Unsupported file type or file is too large.' }, { status: 400 })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({
        error: 'Supabase storage is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment.',
      }, { status: 500 })
    }

    if (!supabaseServiceRoleKey) {
      return NextResponse.json({
        error: 'Missing SUPABASE_SERVICE_ROLE_KEY. Uploads require a service-role key in the server environment.',
      }, { status: 500 })
    }

    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const objectPath = folder ? `${folder}/${fileName}` : fileName
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: file.type })

    const client = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const storage = client.storage

    const { data, error } = await storage.from(bucket).upload(objectPath, blob, {
      contentType: file.type,
      upsert: false,
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 })
    }

    const { data: publicUrlData } = storage.from(bucket).getPublicUrl(objectPath)

    return NextResponse.json({ success: true, url: publicUrlData.publicUrl, path: data?.path || objectPath })
  } catch (error) {
    console.error('Upload route error:', error)
    return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function DELETE(request) {
  try {
    const userId = getServerSession(request)?.user_id
    if (!userId) return NextResponse.json({ error: 'User session is required.' }, { status: 401 })
    if (!supabaseUrl || !supabaseServiceRoleKey) return NextResponse.json({ error: 'Storage is not configured.' }, { status: 500 })

    const { bucket, url } = await request.json()
    const parsedUrl = new URL(String(url || ''))
    const marker = `/storage/v1/object/public/${bucket}/`
    const markerIndex = parsedUrl.pathname.indexOf(marker)
    const objectPath = markerIndex >= 0 ? decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length)) : ''
    const ownedPath = objectPath === `users/${userId}` || objectPath.startsWith(`users/${userId}/`) || objectPath.startsWith(`covers/${userId}/`)

    if (bucket !== 'profile-media' || !ownedPath || !objectPath) {
      return NextResponse.json({ error: 'Invalid storage object.' }, { status: 400 })
    }

    const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await client.storage.from(bucket).remove([objectPath])
    if (error) return NextResponse.json({ error: error.message || 'Unable to remove file.' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Upload removal route error:', error)
    return NextResponse.json({ error: error.message || 'Unable to remove file.' }, { status: 400 })
  }
}