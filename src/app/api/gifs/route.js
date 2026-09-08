import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FALLBACK_GIFS = [
  { id: 'fallback-laugh', title: 'Laughing reaction', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },
  { id: 'fallback-cry', title: 'Crying reaction', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { id: 'fallback-happy', title: 'Happy celebration', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: 'fallback-angry', title: 'Angry reaction', url: 'https://media.giphy.com/media/26BRv0ThflsHCqDrG/giphy.gif' },
  { id: 'fallback-dance', title: 'Dance reaction', url: 'https://media.giphy.com/media/l4FGp3IazW54c0Vd6/giphy.gif' },
  { id: 'fallback-love', title: 'Love reaction', url: 'https://media.giphy.com/media/GEsoqZDGVoisw/giphy.gif' },
  { id: 'fallback-wow', title: 'Wow reaction', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { id: 'fallback-excited', title: 'Excited reaction', url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif' },
  { id: 'fallback-clap', title: 'Clapping reaction', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { id: 'fallback-sad', title: 'Sad reaction', url: 'https://media.giphy.com/media/3orieN7HE9LxM4a7Bu/giphy.gif' },
  { id: 'fallback-party', title: 'Party celebration', url: 'https://media.giphy.com/media/12QMzVeF4QsqTC/giphy.gif' },
  { id: 'fallback-thanks', title: 'Thank you reaction', url: 'https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/giphy.gif' },
]

function normalizeGiphyResult(item) {
  const url = item?.images?.original?.url || item?.images?.downsized?.url || item?.images?.fixed_height?.url || item?.images?.preview_gif?.url
  if (!url) return null
  return {
    id: item?.id || `${item?.title || 'gif'}-${Math.random().toString(36).slice(2, 8)}`,
    title: item?.title || 'GIF',
    url,
  }
}

function normalizeTenorResult(item) {
  const media = item?.media_formats || {}
  const url = media.gif?.url || media.tinygif?.url || media.mp4?.url || item?.itemurl || null
  if (!url) return null
  return {
    id: item?.id || item?.url || `${item?.title || 'gif'}-${Math.random().toString(36).slice(2, 8)}`,
    title: item?.title || 'GIF',
    url,
  }
}

async function fetchFromGiphy(query) {
  const apiKey = process.env.GIF_API_KEY || process.env.GIPHY_API_KEY || process.env.NEXT_PUBLIC_GIPHY_API_KEY
  if (!apiKey) return []

  const search = new URL('https://api.giphy.com/v1/gifs/search')
  search.searchParams.set('api_key', apiKey)
  search.searchParams.set('q', query || 'happy')
  search.searchParams.set('limit', '12')
  search.searchParams.set('rating', 'g')

  const response = await fetch(search, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(`GIPHY API returned ${response.status}`)

  const payload = await response.json()
  const gifs = (payload?.data || []).map(normalizeGiphyResult).filter(Boolean)
  return gifs
}

async function fetchFromTenor(query) {
  const apiKey = process.env.TENOR_API_KEY || process.env.GIF_API_KEY || process.env.GIPHY_API_KEY
  if (!apiKey) return []

  const search = new URL('https://tenor.googleapis.com/v2/search')
  search.searchParams.set('key', apiKey)
  search.searchParams.set('q', query || 'happy')
  search.searchParams.set('limit', '12')
  search.searchParams.set('media_filter', 'gif')
  search.searchParams.set('ar_range', 'standard')

  const response = await fetch(search, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(`Tenor API returned ${response.status}`)

  const payload = await response.json()
  const gifs = (payload?.results || []).map(normalizeTenorResult).filter(Boolean)
  return gifs
}

function getFallbackGifs(query) {
  const normalizedQuery = (query || '').trim().toLowerCase()
  const source = normalizedQuery
    ? FALLBACK_GIFS.filter((gif) => `${gif.title} ${gif.id}`.toLowerCase().includes(normalizedQuery))
    : FALLBACK_GIFS
  return source.slice(0, 12)
}

export async function GET(request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() || 'happy'
  const provider = (process.env.GIF_API_PROVIDER || 'giphy').toLowerCase()

  try {
    let gifs = []

    if (provider === 'tenor') {
      gifs = await fetchFromTenor(query)
    } else {
      gifs = await fetchFromGiphy(query)
    }

    if (gifs.length > 0) {
      return NextResponse.json({ success: true, gifs, source: provider, fallback: false })
    }

    const fallbackGifs = getFallbackGifs(query)
    if (fallbackGifs.length > 0) {
      return NextResponse.json({ success: true, gifs: fallbackGifs, source: 'fallback', fallback: true })
    }

    return NextResponse.json({ success: true, gifs: [], source: 'fallback', fallback: true })
  } catch (error) {
    const fallbackGifs = getFallbackGifs(query)
    return NextResponse.json({
      success: true,
      gifs: fallbackGifs,
      source: 'fallback',
      fallback: true,
      message: error instanceof Error ? error.message : 'GIF provider unavailable',
    })
  }
}
