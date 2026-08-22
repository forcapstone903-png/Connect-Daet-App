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

export async function GET(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const spotId = params.id

  try {
    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .select('*')
      .eq('id', spotId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, spot: data })
  } catch (error) {
    console.error('Tourist spot detail error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load spot details' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const spotId = params.id

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
      view_count
    } = body

    if (!name?.trim() || !location?.trim() || !category) {
      return NextResponse.json(
        { success: false, message: 'Name, location, and category are required.' },
        { status: 400 }
      )
    }

    const updateData = {
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
      updated_at: new Date().toISOString()
    }

    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .update(updateData)
      .eq('id', spotId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, spot: data })
  } catch (error) {
    console.error('Tourist spot update error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to update spot' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  if (!adminSupabase) return missingConfig()
  const spotId = params.id

  try {
    const { error } = await adminSupabase
      .from('info_tourist_spots')
      .delete()
      .eq('id', spotId)

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Spot deleted successfully' })
  } catch (error) {
    console.error('Tourist spot delete error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to delete spot' }, { status: 500 })
  }
}
