'use client'

import Link from 'next/link'
import { Clock, Globe, Mail, MapPin, Phone, Share2, Siren } from 'lucide-react'
import { usePublicSettings } from '@/lib/usePublicSettings'

const telHref = (value) => `tel:${String(value).replace(/[^0-9+]/g, '')}`

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-0.5 text-sm text-slate-800">{children}</div>
      </div>
    </div>
  )
}

export default function ContactPage() {
  const { settings, loaded } = usePublicSettings()
  const { contact } = settings

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/info" className="text-sm font-semibold text-sky-700 hover:underline">Back to {settings.siteName}</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Contact</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-slate-900 sm:text-4xl">{settings.tourismOfficeName}</h1>
        <p className="mt-2 text-sm text-slate-600">{settings.municipality.name}, {settings.municipality.province}</p>

        {contact.emergencyHotline ? (
          <a href={telHref(contact.emergencyHotline)} className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
            <Siren className="h-6 w-6" aria-hidden="true" />
            <span><span className="block text-xs font-semibold uppercase tracking-wide">Emergency hotline</span><span className="text-lg font-bold">{contact.emergencyHotline}</span></span>
          </a>
        ) : null}

        <section className="mt-6 divide-y divide-slate-100">
          {!loaded ? <p className="py-3 text-sm text-slate-500">Loading…</p> : null}
          {contact.phone ? <Row icon={Phone} label="Phone"><a href={telHref(contact.phone)} className="font-semibold text-sky-700 hover:underline">{contact.phone}</a></Row> : null}
          {contact.email ? <Row icon={Mail} label="Email"><a href={`mailto:${contact.email}`} className="font-semibold text-sky-700 hover:underline">{contact.email}</a></Row> : null}
          {contact.address ? (
            <Row icon={MapPin} label="Office address">
              {contact.address}
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact.address)}`} target="_blank" rel="noopener noreferrer" className="ml-2 font-semibold text-sky-700 hover:underline">Directions</a>
            </Row>
          ) : null}
          {contact.officeHours ? <Row icon={Clock} label="Office hours">{contact.officeHours}</Row> : null}
          {contact.facebookUrl ? <Row icon={Share2} label="Facebook"><a href={contact.facebookUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-700 hover:underline">{contact.facebookUrl.replace(/^https:\/\//, '')}</a></Row> : null}
          {contact.websiteUrl ? <Row icon={Globe} label="Website"><a href={contact.websiteUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-700 hover:underline">{contact.websiteUrl.replace(/^https:\/\//, '')}</a></Row> : null}
        </section>

        <section className="mt-8 rounded-2xl bg-slate-50 p-5">
          <h2 className="text-base font-bold text-slate-900">Send an inquiry or feedback</h2>
          <p className="mt-1 text-sm text-slate-600">Signed-in visitors can send questions and feedback to the tourism office and follow the status and reply in their account.</p>
          <Link href="/info/user/feedback" className="mt-4 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Send an inquiry</Link>
        </section>
      </article>
    </main>
  )
}
