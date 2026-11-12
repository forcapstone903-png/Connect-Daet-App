'use client'

import Link from 'next/link'
import { usePublicSettings } from '@/lib/usePublicSettings'

export default function AboutPage() {
  const { settings, loaded } = usePublicSettings()
  const { municipality } = settings
  const paragraphs = (municipality.description || '').split(/\n\s*\n/).map((text) => text.trim()).filter(Boolean)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/info" className="text-sm font-semibold text-sky-700 hover:underline">Back to {settings.siteName}</Link>
        <div className="mt-8 flex items-center gap-4">
          {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="h-16 w-16 rounded-2xl object-contain" /> : null}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">About</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">
              {municipality.name}, {municipality.province}
            </h1>
            {municipality.region ? <p className="mt-1 text-sm text-slate-500">{municipality.region}</p> : null}
          </div>
        </div>

        <section className="mt-8 space-y-4 text-sm leading-7 text-slate-700">
          {!loaded ? <p className="text-slate-500">Loading…</p> : paragraphs.length ? (
            paragraphs.map((text, index) => <p key={index} className="whitespace-pre-line">{text}</p>)
          ) : (
            <p>{settings.siteName} brings together tourism information and real-time public alerts for {municipality.name}: places to visit, stay and eat, local events, community stories, and safety advisories from the {settings.tourismOfficeName}.</p>
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-50 p-5">
          <h2 className="text-base font-bold text-slate-900">About this site</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{settings.tagline}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            <Link href="/info/visitor/tourist-spots" className="rounded-full bg-sky-600 px-4 py-2 text-white">Explore places</Link>
            <Link href="/info/visitor/events" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700">Events</Link>
            <Link href="/info/visitor/alerts" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700">Alerts</Link>
            <Link href="/info/contact" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700">Contact us</Link>
            <Link href="/info/community-guidelines" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-700">Community guidelines</Link>
          </div>
        </section>
      </article>
    </main>
  )
}
