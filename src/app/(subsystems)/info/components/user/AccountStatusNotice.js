'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'

const STATUS_STYLES = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  pending: 'border-amber-200 bg-amber-50 text-amber-950',
  suspended: 'border-orange-200 bg-orange-50 text-orange-950',
}

function formatDate(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AccountStatusNotice() {
  const [account, setAccount] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/info/api/account/status', {
            credentials: 'same-origin',
            cache: 'no-store',
          })
          const result = await response.json()
          if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load account status.')
          if (active) setAccount(result)
        } catch (loadError) {
          if (active) setError(loadError.message || 'Unable to load account status.')
        }
      })()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  if (error) {
    return <p role="alert" className="mx-auto my-3 max-w-7xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
  }
  if (!account) return null

  const status = ['active', 'pending', 'suspended'].includes(account.status) ? account.status : 'active'
  const title = status === 'active'
    ? 'Account active'
    : status === 'pending'
      ? 'Your account is currently pending verification'
      : 'Your account has been temporarily suspended'
  const message = status === 'pending'
    ? 'Some community features are temporarily unavailable while your account is awaiting verification or approval. You can still browse tourism information and manage your profile. You will receive a notification once your account has been reviewed and approved.'
    : status === 'suspended'
      ? 'Your access to Daet Connect community features has been restricted due to a violation of our Community Guidelines. You cannot create posts, comment, react, or participate in discussions until your suspension expires or is lifted by the moderation team. If you believe this decision was made in error, you may submit an appeal for review.'
      : 'Your account can access permitted Daet Connect features.'

  return (
    <section aria-live="polite" className={`mx-auto my-3 max-w-7xl rounded-2xl border px-4 py-4 shadow-sm sm:px-5 ${STATUS_STYLES[status]}`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">{title}</h2>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">{status}</span>
          </div>
          <p className="mt-1 text-sm leading-6">{message}</p>
          {status === 'suspended' ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="font-semibold">Reason</dt><dd>{account.reason || 'Not provided'}</dd></div>
              <div><dt className="font-semibold">Suspended on</dt><dd>{formatDate(account.startedAt)}</dd></div>
              <div><dt className="font-semibold">Suspension ends</dt><dd>{formatDate(account.expiresAt)}</dd></div>
            </dl>
          ) : null}
          {status === 'suspended' ? (
            <Link href="/info/user/moderation-appeals" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-current/20 bg-white/70 px-3 text-sm font-bold underline underline-offset-2">
              View suspension details or submit an appeal
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}