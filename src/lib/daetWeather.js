const DAET_COORDS = { lat: 14.1122, lon: 122.9553 }
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000
const WEATHER_MAX_STALE_MS = 60 * 60 * 1000

let cachedWeather = null
let weatherRequest = null

async function fetchProviderJson(url) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })

      if (!result.ok) {
        const error = new Error(`Weather provider returned ${result.status}.`)
        if (result.status < 500 && result.status !== 429) {
          error.retryable = false
          throw error
        }
        lastError = error
      } else {
        return await result.json()
      }
    } catch (error) {
      if (error.retryable === false) throw error
      lastError = error
    }

    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw lastError || new Error('Weather provider request failed.')
}

function describeWeather(code) {
  if (code === 0) return { condition: 'Clear', description: 'clear sky', icon: '01d' }
  if (code === 1) return { condition: 'Clouds', description: 'mainly clear', icon: '02d' }
  if (code === 2) return { condition: 'Clouds', description: 'partly cloudy', icon: '03d' }
  if (code === 3) return { condition: 'Clouds', description: 'overcast', icon: '04d' }
  if (code === 45 || code === 48) return { condition: 'Mist', description: 'fog', icon: '50d' }
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', description: 'light rain', icon: '09d' }
  if (code >= 61 && code <= 67) return { condition: 'Rain', description: 'rain', icon: '10d' }
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return { condition: 'Snow', description: 'snow', icon: '13d' }
  if (code >= 80 && code <= 82) return { condition: 'Rain', description: 'rain showers', icon: '09d' }
  if (code >= 95) return { condition: 'Thunderstorm', description: 'thunderstorm', icon: '11d' }
  return { condition: 'Clouds', description: 'variable conditions', icon: '03d' }
}

async function fetchDaetWeather() {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(DAET_COORDS.lat),
    longitude: String(DAET_COORDS.lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'Asia/Manila',
    forecast_days: '5',
    wind_speed_unit: 'ms',
  })
  const data = await fetchProviderJson(url)

  if (!data?.current || !data?.daily?.time || !data.daily.temperature_2m_min || !data.daily.temperature_2m_max) {
    throw new Error('Weather provider returned an invalid response.')
  }

  const currentCondition = describeWeather(data.current.weather_code)
  const forecast = data.daily.time.map((date, index) => {
    const condition = describeWeather(data.daily.weather_code[index])
    const tempMin = data.daily.temperature_2m_min[index]
    const tempMax = data.daily.temperature_2m_max[index]
    return {
      date,
      temp: (tempMin + tempMax) / 2,
      temp_min: tempMin,
      temp_max: tempMax,
      ...condition,
    }
  })
  return {
    current: {
      temp: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      condition: currentCondition.condition,
      description: currentCondition.description,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      pressure: data.current.pressure_msl,
      sunrise: data.daily.sunrise?.[0] ? Math.floor(new Date(data.daily.sunrise[0]).getTime() / 1000) : null,
      sunset: data.daily.sunset?.[0] ? Math.floor(new Date(data.daily.sunset[0]).getTime() / 1000) : null,
      icon: currentCondition.icon,
      rainAmount: data.current.precipitation ?? 0,
    },
    forecast,
    lastUpdated: new Date().toISOString(),
  }
}

export async function getDaetWeather({ allowStale = false } = {}) {
  const now = Date.now()
  if (allowStale && cachedWeather && now - cachedWeather.cachedAt < WEATHER_CACHE_TTL_MS) {
    return { ...cachedWeather.weather, stale: false }
  }
  if (allowStale && weatherRequest) return weatherRequest

  const request = fetchDaetWeather()
    .then((weather) => {
      cachedWeather = { weather, cachedAt: Date.now() }
      return { ...weather, stale: false }
    })
    .catch((error) => {
      if (allowStale && cachedWeather && Date.now() - cachedWeather.cachedAt < WEATHER_MAX_STALE_MS) {
        return { ...cachedWeather.weather, stale: true }
      }
      throw error
    })

  if (!allowStale) return request
  weatherRequest = request
  try {
    return await request
  } finally {
    weatherRequest = null
  }
}

export function clearDaetWeatherCache() {
  cachedWeather = null
}
