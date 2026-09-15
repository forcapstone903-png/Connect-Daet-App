'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const ALERT_EVENT = 'daet-alert-toast'

export default function AlertToast() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const nativeAlert = window.alert
    let timeoutId

    const showAlert = (event) => {
      const nextMessage = String(event.detail?.message || '').trim()
      if (!nextMessage) return
      setMessage(nextMessage)
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => setMessage(''), 3500)
    }

    window.alert = (value) => {
      window.dispatchEvent(new CustomEvent(ALERT_EVENT, { detail: { message: value } }))
    }
    window.addEventListener(ALERT_EVENT, showAlert)

    return () => {
      window.alert = nativeAlert
      window.removeEventListener(ALERT_EVENT, showAlert)
      window.clearTimeout(timeoutId)
    }
  }, [])

  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center" role="status" aria-live="polite">
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-2xl">
        <span className="min-w-0 flex-1">{message}</span>
        <button type="button" onClick={() => setMessage('')} aria-label="Dismiss notification" className="shrink-0 rounded-md p-0.5 text-slate-300 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
