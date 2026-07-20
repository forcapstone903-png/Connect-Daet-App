import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const bucket = formData.get('bucket') || 'avatars'
    const folder = formData.get('folder') || 'uploads'

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was provided.' }, { status: 400 })
    }

    if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
      return NextResponse.json({ error: 'Supabase storage is not configured.' }, { status: 500 })
    }

    const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    const objectPath = folder ? `${folder}/${fileName}` : fileName
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: file.type })

    const client = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await client.storage.from(bucket).upload(objectPath, blob, {
      contentType: file.type,
      upsert: true,
    })

    if (error) {
      return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 })
    }

    const { data: publicUrlData } = client.storage.from(bucket).getPublicUrl(objectPath)

    return NextResponse.json({ success: true, url: publicUrlData.publicUrl, path: data?.path || objectPath })
  } catch (error) {
    console.error('Upload route error:', error)
    return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}