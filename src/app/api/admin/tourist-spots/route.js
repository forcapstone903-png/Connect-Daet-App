import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const adminSupabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function missingConfig() {
  return NextResponse.json(
    { success: false, message: 'Server is not configured for tourist spots administration.' },
    { status: 500 }
  )
}

export async function GET(request) {
  if (!adminSupabase) return missingConfig()

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const status = searchParams.get('status')

    let query = adminSupabase
      .from('info_tourist_spots')
      .select('*')
      .order('created_at', { ascending: false })

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    const { data, error } = await query
    
    if (error) {
      console.error('Tourist spots fetch error:', error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    const formattedSpots = (data || []).map((spot) => ({
      ...spot,
      gallery_images: spot.gallery_images || [],
      view_count: spot.view_count || 0,
      featured: !!spot.featured,
      rating: spot.rating || 0,
    }))

    return NextResponse.json({ success: true, spots: formattedSpots })
  } catch (error) {
    console.error('Tourist spots list error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to fetch tourist spots' }, { status: 500 })
  }
}

export async function POST(request) {
  if (!adminSupabase) return missingConfig()

  try {
    const body = await request.json()
    const {
      name,
      description,
      location,
      latitude,
      longitude,
      category,
      opening_hours,
      entrance_fee,
      contact_number,
      image_url,
      gallery_images,
      rating,
      status,
      featured,
      view_count,
      created_by
    } = body

    if (!name?.trim() || !location?.trim() || !category) {
      return NextResponse.json(
        { success: false, message: 'Name, location, and category are required.' },
        { status: 400 }
      )
    }

    const spotData = {
      name: name.trim(),
      description: description || '',
      location: location.trim(),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      category,
      opening_hours: opening_hours || '',
      entrance_fee: entrance_fee ? parseFloat(entrance_fee) : null,
      contact_number: contact_number || '',
      image_url: image_url || null,
      gallery_images: gallery_images?.length ? gallery_images : null,
      rating: rating || 0,
      status: status || 'published',
      featured: !!featured,
      view_count: view_count || 0,
      created_by: created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .insert([spotData])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, spot: data })
  } catch (error) {
    console.error('Tourist spot create error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to create spot' }, { status: 500 })
  }
}
