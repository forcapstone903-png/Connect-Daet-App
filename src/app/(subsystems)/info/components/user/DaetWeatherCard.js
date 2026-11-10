'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Loader, RefreshCw, Sun } from 'lucide-react'

const weatherIcons = {
  Clear: Sun,
  Clouds: Cloud,
  Drizzle: CloudDrizzle,
  Rain: CloudRain,
  Thunderstorm: CloudLightning,
  Snow: CloudSnow,
  Mist: CloudFog,
  Smoke: CloudFog,
  Haze: CloudFog,
  Dust: CloudFog,
  Fog: CloudFog,
  Sand: CloudFog,
  Ash: CloudFog,
  Squall: CloudFog,
  Tornado: CloudFog,
}

function formatForecastDay(value) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { weekday: 'short' })
}

export default function DaetWeatherCard() {
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadWeather = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/info/api/weather', { cache: 'no-store', signal })
      const result = await response.json()
      if (!response.ok || !result.success || !result.weather?.current) {
        throw new Error(result.message || 'Daet weather is temporarily unavailable.')
      }
      setWeather(result.weather)
    } catch (loadError) {
      if (loadError.name === 'AbortError') return
      setError(loadError.message || 'Daet weather is temporarily unavailable.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let activeController = null
    const refresh = () => {
      activeController?.abort()
      activeController = new AbortController()
      loadWeather(activeController.signal)
    }
    const initialLoad = window.setTimeout(refresh, 0)
    const interval = window.setInterval(refresh, 30 * 60 * 1000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(interval)
      activeController?.abort()
    }
  }, [loadWeather])

  const CurrentIcon = weatherIcons[weather?.current?.condition] || Cloud

  return (
    <section className="usr-card usr-enter rounded-[18px] p-4" aria-label="Daet weather forecast">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">Daet forecast</p>
          <p className="mt-1 text-xs font-medium text-slate-500">Daet, Camarines Norte</p>
        </div>
        <button
          type="button"
          onClick={() => loadWeather()}
          disabled={loading}
          aria-label="Refresh Daet weather"
          className="usr-press inline-flex h-8 w-8 items-center justify-center rounded-full text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {loading && !weather ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500" role="status">
          <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />Loading forecast…
        </div>
      ) : error && !weather ? (
        <div className="mt-3">
          <p className="text-xs text-slate-600">{error}</p>
          <button type="button" onClick={() => loadWeather()} className="mt-2 text-xs font-bold text-sky-700 hover:underline">Try again</button>
        </div>
      ) : weather ? (
        <>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-sky-50 p-3">
            <CurrentIcon className="h-9 w-9 shrink-0 text-sky-600" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-2xl font-black leading-none text-slate-900">{weather.current.temp}°C</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-600">{weather.current.description}</p>
            </div>
            <p className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">Now</p>
          </div>
          {weather.forecast?.length > 0 && (
            <div className="mt-3 grid grid-cols-5 gap-1">
              {weather.forecast.map((day) => {
                const DayIcon = weatherIcons[day.condition] || Cloud
                return (
                  <div key={day.date} className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-center">
                    <span className="text-[10px] font-bold text-slate-500">{formatForecastDay(day.date)}</span>
                    <DayIcon className="h-4 w-4 text-sky-600" aria-hidden="true" />
                    <span className="text-[10px] font-bold text-slate-700">{Math.round(day.temp_max)}°</span>
                    <span className="text-[9px] text-slate-400">{Math.round(day.temp_min)}°</span>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-slate-400">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="hover:text-sky-700 hover:underline">Weather by Open-Meteo</a>
            <span>{weather.stale ? 'Showing recently saved forecast' : `Updated ${new Date(weather.lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}</span>
          </div>
          {error ? (
            <p className="mt-2 text-[10px] leading-4 text-amber-700" role="status">
              Could not refresh the latest forecast. Showing the last available weather.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
