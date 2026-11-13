'use client'

import { useState } from 'react'
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
  const [showInquiryForm, setShowInquiryForm] = useState(false)
  const [submittingInquiry, setSubmittingInquiry] = useState(false)
  const [inquiryNotice, setInquiryNotice] = useState('')
  const [inquiry, setInquiry] = useState({ name: '', email: '', title: '', message: '', website: '' })

  const submitInquiry = async (event) => {
    event.preventDefault()
    setSubmittingInquiry(true)
    setInquiryNotice('')

    try {
      const response = await fetch('/info/api/contact/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inquiry),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        setInquiryNotice(result?.message || 'Unable to send your inquiry right now.')
        return
      }

      setInquiry({ name: '', email: '', title: '', message: '', website: '' })
      setInquiryNotice('Your inquiry has been sent. The tourism office can contact you using the email you provided.')
    } catch (error) {
      console.error('Inquiry submission failed:', error)
      setInquiryNotice(error?.message || 'Unable to send your inquiry right now. Please try again later.')
    } finally {
      setSubmittingInquiry(false)
    }
  }

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
          <p className="mt-1 text-sm text-slate-600">Send questions or feedback to the tourism office. No account or login is required.</p>
          {!showInquiryForm ? (
            <button
              type="button"
              onClick={() => setShowInquiryForm(true)}
              className="mt-4 inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Send an inquiry
            </button>
          ) : (
            <form onSubmit={submitInquiry} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Your name
                  <input
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={inquiry.name}
                    onChange={(event) => setInquiry({ ...inquiry, name: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Email address
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={inquiry.email}
                    onChange={(event) => setInquiry({ ...inquiry, email: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Subject
                <input
                  required
                  maxLength={150}
                  value={inquiry.title}
                  onChange={(event) => setInquiry({ ...inquiry, title: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Message
                <textarea
                  required
                  maxLength={5000}
                  rows={5}
                  value={inquiry.message}
                  onChange={(event) => setInquiry({ ...inquiry, message: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
              </label>
              <label aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={inquiry.website}
                  onChange={(event) => setInquiry({ ...inquiry, website: event.target.value })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submittingInquiry}
                  className="inline-flex rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingInquiry ? 'Sending…' : 'Submit inquiry'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowInquiryForm(false)
                    setInquiryNotice('')
                  }}
                  className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
              {inquiryNotice ? <p role="status" aria-live="polite" className="text-sm text-slate-700">{inquiryNotice}</p> : null}
            </form>
          )}
        </section>
      </article>
    </main>
  )
}
