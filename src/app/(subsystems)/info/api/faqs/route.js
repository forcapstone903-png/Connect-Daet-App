import { NextResponse } from 'next/server'
import { getPublishedFaqs } from '@/lib/publicFaqsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  try {
    const items = await getPublishedFaqs()
    return NextResponse.json({ success: true, items }, { headers: NO_STORE })
  } catch (error) {
    console.error('Public FAQ request failed:', error)
    return NextResponse.json(
      { success: false, message: 'Unable to load FAQs right now.' },
      { status: 500, headers: NO_STORE }
    )
  }
}
