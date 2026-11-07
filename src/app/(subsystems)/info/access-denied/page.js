'use client'

import Link from 'next/link'
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react'

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_25px_80px_rgba(15,23,42,0.08)]">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 ring-4 ring-rose-100">
          <ShieldAlert className="h-8 w-8 text-rose-600" />
        </div>

        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-rose-600">Access denied</p>
          <h1 className="mt-3 text-3xl font-black text-slate-900">You do not have permission to view this page.</h1>
          <p className="mt-3 text-sm text-slate-600">
            This area is restricted to authorized users only. If you believe this is a mistake, please sign in with the correct account or contact an administrator.
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 text-slate-500" />
            <span>Only verified and authorized users can access protected Daet admin and member pages.</span>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Go to homepage
          </Link>
        </div>
      </div>
    </main>
  )
}
