import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

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
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const { id: spotId } = await params

  try {
    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .select('*')
      .eq('id', spotId)
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      spot: {
        ...data,
        image_url: data.image_url || data.featured_image || null,
        gallery_images: data.gallery_images?.length ? data.gallery_images : data.images || [],
        entrance_fee: data.entrance_fee ?? data.entry_fee ?? null,
        view_count: data.view_count ?? data.visit_count ?? 0,
      },
    })
  } catch (error) {
    console.error('Tourist spot detail error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to load spot details' }, { status: 500 })
  }
}

export async function PUT(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const { id: spotId } = await params

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
      latitude: latitude === '' || latitude == null ? null : Number(latitude),
      longitude: longitude === '' || longitude == null ? null : Number(longitude),
      category,
      opening_hours: opening_hours || '',
      entry_fee: entrance_fee === '' || entrance_fee == null ? null : Number(entrance_fee),
      contact_number: contact_number || '',
      image_url: image_url || null,
      featured_image: image_url || null,
      gallery_images: gallery_images?.length ? gallery_images : null,
      rating: rating || 0,
      status: status || 'active',
      featured: !!featured,
      visit_count: view_count || 0,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await adminSupabase
      .from('info_tourist_spots')
      .update(updateData)
      .eq('id', spotId)
      .select()
      .single()

    if (error) {
      console.error('Tourist spot update error:', error)
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      spot: {
        ...data,
        image_url: data.image_url || data.featured_image || null,
        gallery_images: data.gallery_images?.length ? data.gallery_images : data.images || [],
        entrance_fee: data.entrance_fee ?? data.entry_fee ?? null,
        view_count: data.view_count ?? data.visit_count ?? 0,
      },
    })
  } catch (error) {
    console.error('Tourist spot update error:', error)
    return NextResponse.json({ success: false, message: error.message || 'Unable to update spot' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError
  if (!adminSupabase) return missingConfig()
  const { id: spotId } = await params

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
