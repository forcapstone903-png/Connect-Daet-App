'use client'

import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import AccountStatusNotice from '@/app/(subsystems)/info/components/user/AccountStatusNotice'

export default function AccountSuspendedPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-700">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-center text-2xl font-bold text-slate-900">Account access information</h1>
        <AccountStatusNotice />
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/info/user/moderation-appeals" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white">
            View appeals
          </Link>
          <Link href="/info/user/notifications" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700">
            Notifications
          </Link>
          <Link href="/info/visitor/tourist-spots" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700">
            Browse tourism information
          </Link>
        </div>
      </section>
    </main>
  )
}
