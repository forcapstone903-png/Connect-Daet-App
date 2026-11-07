'use client'

export default function WeatherWidget() {
  // placeholder static widget; can be wired to real API
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">Daet</div>
          <div className="text-lg font-bold">28°C • Sunny</div>
        </div>
        <div className="text-sm text-gray-400">3 day forecast</div>
      </div>
    </div>
  )
}
