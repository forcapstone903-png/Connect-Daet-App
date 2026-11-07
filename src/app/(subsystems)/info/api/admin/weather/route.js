import { NextResponse } from 'next/server'
import { authorizeAdminApi } from '@/lib/adminApiAuth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY?.trim()
const DAET_COORDS = { lat: 14.1122, lon: 122.9553 }
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

async function fetchProviderJson(url) {
  const result = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })

  if (!result.ok) throw new Error(`Weather provider returned ${result.status}.`)
  return result.json()
}

export async function GET(request) {
  const { response: authError } = authorizeAdminApi(request)
  if (authError) return authError

  if (!WEATHER_API_KEY) {
    return response({ success: false, message: 'Weather service is not configured.' }, 503)
  }

  try {
    const currentUrl = new URL('https://api.openweathermap.org/data/2.5/weather')
    currentUrl.search = new URLSearchParams({
      lat: String(DAET_COORDS.lat),
      lon: String(DAET_COORDS.lon),
      units: 'metric',
      appid: WEATHER_API_KEY,
    }).toString()

    const forecastUrl = new URL('https://api.openweathermap.org/data/2.5/forecast')
    forecastUrl.search = new URLSearchParams({
      lat: String(DAET_COORDS.lat),
      lon: String(DAET_COORDS.lon),
      units: 'metric',
      appid: WEATHER_API_KEY,
    }).toString()

    const [currentData, forecastData] = await Promise.all([
      fetchProviderJson(currentUrl),
      fetchProviderJson(forecastUrl),
    ])

    if (
      !currentData?.main || !currentData?.weather?.[0]
      || !Array.isArray(forecastData?.list)
    ) {
      throw new Error('Weather provider returned an invalid response.')
    }

    const dailyForecast = []
    const seenDates = new Set()
    for (const item of forecastData.list) {
      const date = item.dt_txt?.split(' ')[0]
      if (!date || seenDates.has(date) || !item.main || !item.weather?.[0]) continue
      seenDates.add(date)
      dailyForecast.push({
        date,
        temp_min: item.main.temp_min,
        temp_max: item.main.temp_max,
        temp: item.main.temp,
        condition: item.weather[0].main,
        description: item.weather[0].description,
        icon: item.weather[0].icon,
      })
      if (dailyForecast.length === 5) break
    }

    const currentCondition = currentData.weather[0]
    return response({
      success: true,
      weather: {
        current: {
          temp: Math.round(currentData.main.temp),
          feelsLike: Math.round(currentData.main.feels_like),
          condition: currentCondition.main,
          description: currentCondition.description,
          humidity: currentData.main.humidity,
          windSpeed: currentData.wind?.speed ?? 0,
          pressure: currentData.main.pressure,
          sunrise: currentData.sys?.sunrise,
          sunset: currentData.sys?.sunset,
          icon: currentCondition.icon,
          rainAmount: currentData.rain?.['1h'] ?? 0,
        },
        forecast: dailyForecast,
        lastUpdated: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Admin weather request failed:', error)
    return response({ success: false, message: 'Live weather data is temporarily unavailable.' }, 502)
  }
}
