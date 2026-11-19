'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  pending: 'Pending',
  suspended: 'Suspended',
  banned: 'Banned',
  pending_deletion: 'Pending Deletion',
}

export const ACCOUNT_STATUS_OPTIONS = ['active', 'pending', 'suspended', 'banned']

export const ACCOUNT_STATUS_DESCRIPTIONS = {
  active: 'Full access to permitted user features, including browsing destinations, creating posts, commenting, reacting, joining discussions, and submitting feedback.',
  pending: 'Limited access while the account is awaiting verification or approval. Cannot create posts, comment, or participate in restricted community activities.',
  suspended: 'Temporarily restricted from accessing community features due to a moderation decision. Cannot create posts, comment, react, or participate in discussions until suspension expires or is lifted.',
  banned: 'Permanently prohibited from using the account to access community features. Cannot log in or participate in the platform unless an authorized administrator reverses the ban.',
}

const STATUS_DOT_CLASSES = {
  active: 'bg-green-500',
  pending: 'bg-amber-500',
  suspended: 'bg-orange-500',
  banned: 'bg-red-700',
}

export default function AccountStatusSelect({
  account,
  onContinue,
  continueHref,
  continueLabel = 'Manage through Account Oversight',
  statusOptions = ACCOUNT_STATUS_OPTIONS,
}) {
  const router = useRouter()
  const currentStatus = account.status || 'active'
  const [selectedStatus, setSelectedStatus] = useState(currentStatus)
  const [message, setMessage] = useState('')
  const hasUnsupportedCurrentStatus = !statusOptions.includes(currentStatus)

  const handleStatusChange = (nextStatus) => {
    setMessage('')
    if (nextStatus === currentStatus) {
      setSelectedStatus(currentStatus)
      return
    }

    if (onContinue) {
      const nextMessage = onContinue(account, nextStatus)
      setMessage(nextMessage || '')
      setSelectedStatus(currentStatus)
      return
    }

    if (continueHref) {
      const href = typeof continueHref === 'function'
        ? continueHref(account, nextStatus)
        : continueHref
      router.push(href)
      setSelectedStatus(currentStatus)
      return
    }

    setSelectedStatus(nextStatus)
  }

  return (
    <div className="min-w-[190px]">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 flex-none rounded-full ${STATUS_DOT_CLASSES[selectedStatus] || 'bg-slate-400'}`}
        />
        <label className="sr-only" htmlFor={`account-status-${account.id}`}>
          Account status for {account.full_name || account.username || account.email}
        </label>
        <select
          id={`account-status-${account.id}`}
          value={selectedStatus}
          onChange={(event) => handleStatusChange(event.target.value)}
          className="w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-200"
        >
          {hasUnsupportedCurrentStatus ? (
            <option value={currentStatus} disabled>
              {ACCOUNT_STATUS_LABELS[currentStatus] || currentStatus}
            </option>
          ) : null}
          {statusOptions.map((option) => (
            <option key={option} value={option}>{ACCOUNT_STATUS_LABELS[option]}</option>
          ))}
        </select>
      </div>
      {selectedStatus !== currentStatus ? (
        <div className="mt-2">
          <p className="text-xs leading-5 text-slate-600">{ACCOUNT_STATUS_DESCRIPTIONS[selectedStatus]}</p>
          {onContinue ? (
            <button
              type="button"
              onClick={() => {
                const nextMessage = onContinue(account, selectedStatus)
                setMessage(nextMessage || '')
                if (!nextMessage) setSelectedStatus(currentStatus)
              }}
              className="mt-1 text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              Continue through review
            </button>
          ) : continueHref ? (
            <Link
              href={typeof continueHref === 'function'
                ? continueHref(account, selectedStatus)
                : continueHref}
              className="mt-1 inline-block text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              {continueLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="mt-2 text-xs leading-5 text-amber-800" role="status">{message}</p> : null}
    </div>
  )
}
