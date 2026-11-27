'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Compass,
  Heart,
  Landmark,
  MapPin,
  Shield,
  Sparkles,
  Waves,
} from 'lucide-react'
import { usePublicSettings } from '@/lib/usePublicSettings'
import VisitorNavbar from '@/app/(subsystems)/info/components/visitor/VisitorNavbar'
import VisitorFooter from '@/app/(subsystems)/info/components/visitor/VisitorFooter'
import connectDaetLogo from '@/app/(subsystems)/info/assets/images/logo.png'

const DAET_STATS = [
  { label: 'Surfing Capital', value: 'Bagasbas', hint: 'Birthplace of Philippine surfing in Bicol' },
  { label: 'Historical First', value: '1898', hint: 'First Rizal Monument in the world' },
  { label: 'Sweetest Produce', value: 'Queen Formosa', hint: 'World-renowned miniature pineapple' },
  { label: 'Founding Year', value: '85th', hint: 'Rich heritage & vibrant community' },
]

const HIGHLIGHTS = [
  {
    icon: Waves,
    title: 'World-Class Surfing & Eco-Tourism',
    description: 'Bagasbas Beach offers consistent rolling waves and fine sandy bottoms, ideal for both beginners and seasoned surfers, complemented by stunning Pacific sunrise vistas.',
    color: 'from-blue-500 to-sky-400',
  },
  {
    icon: Landmark,
    title: 'Historic Roots & Heritage',
    description: 'Home to the first monument erected in honor of Dr. Jose Rizal and colonial-era churches including St. John the Baptist Parish, standing since the 17th century.',
    color: 'from-amber-500 to-orange-400',
  },
  {
    icon: Sparkles,
    title: 'Pinyasan & Culinary Wonders',
    description: 'Celebrated every June, the Pinyasan Festival honors the Queen Formosa pineapple with street dancing, agricultural showcases, and mouth-watering Bicolano cuisine.',
    color: 'from-emerald-500 to-teal-400',
  },
  {
    icon: Compass,
    title: 'Gateway to Camarines Norte',
    description: 'Daet serves as the bustling commercial, educational, and transportation hub connecting adventurers to the Calaguas Islands and surrounding natural wonders.',
    color: 'from-indigo-500 to-purple-400',
  },
]

export default function AboutPage() {
  const { settings, loaded } = usePublicSettings()
  const { municipality } = settings

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-900">
      <VisitorNavbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-[#081c49] via-[#0b2968] to-[#041130] py-16 text-white sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.15),transparent_60%)] pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold text-sky-300 backdrop-blur-md">
                <MapPin className="h-3.5 w-3.5" />
                <span>Capital of Camarines Norte</span>
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-6xl">
                About {municipality.name || 'Daet'}, {municipality.province || 'Camarines Norte'}
              </h1>

              <p className="mt-4 text-base leading-relaxed text-slate-200 sm:text-lg">
                Where pacific tides meet timeless heritage. Discover the vibrant story of our municipality, its people, and the digital platform connecting you to it all.
              </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {DAET_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300">{stat.label}</p>
                  <p className="mt-1 text-2xl font-black text-white sm:text-3xl">{stat.value}</p>
                  <p className="mt-1 text-[11px] text-slate-300">{stat.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Narrative & Highlights Section */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            {/* Story / About Description */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#1d68ed]">
                  Our Municipality
                </span>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  A Town Steeped in Natural Beauty &amp; Warm Hospitality
                </h2>
              </div>

              <div className="space-y-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                {!loaded ? (
                  <div role="status" className="space-y-4">
                    <span className="sr-only">Loading municipality information</span>
                    <div aria-hidden="true" className="animate-pulse space-y-3">
                      <div className="h-4 w-full rounded-full bg-slate-200" />
                      <div className="h-4 w-11/12 rounded-full bg-slate-200" />
                      <div className="h-4 w-4/5 rounded-full bg-slate-200" />
                      <div className="h-4 w-full rounded-full bg-slate-200" />
                      <div className="h-4 w-2/3 rounded-full bg-slate-200" />
                    </div>
                  </div>
                ) : municipality.description ? (
                  municipality.description.split(/\n\s*\n/).map((paragraph, index) => (
                    <p key={index}>{paragraph.trim()}</p>
                  ))
                ) : (
                  <>
                    <p>
                      Daet is the vibrant capital town of the province of Camarines Norte in the Bicol Region of the Philippines. Renowned for Bagasbas Beach, one of the earliest surf spots popularized in the country, Daet has grown into a favored destination for beachgoers, kite-surfers, and adventurers from around the world.
                    </p>
                    <p>
                      Beyond its shores, Daet is celebrated as the home of the world-famous Queen Formosa pineapple, renowned for its intense natural sweetness and aromatic flavor. Every year, the vibrant Pinyasan Festival transforms the streets into a colorful carnival of dance, music, and gratitude.
                    </p>
                    <p>
                      {settings.siteName || 'Connect Daet'} serves as the official digital bridge created by the {settings.tourismOfficeName || 'Municipality of Daet Tourism Office'}, empowering residents and visitors alike to navigate attractions, explore events, stay protected with verified safety advisories, and share in our local community.
                    </p>
                  </>
                )}
              </div>

              {/* Call to action badges */}
              <div className="flex flex-wrap gap-2 pt-4">
                <Link
                  href="/info/visitor/tourist-spots"
                  className="inline-flex items-center gap-2 rounded-full bg-[#1d68ed] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-600 hover:shadow-lg"
                >
                  <span>Explore Attractions</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href="/info/visitor/events"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
                >
                  <span>Upcoming Events</span>
                </Link>
              </div>
            </div>

            {/* Highlights Grid */}
            <div className="lg:col-span-5 space-y-4">
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className="flex gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-sky-300"
                  >
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-md`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Tourism Office Information Card */}
        <section className="bg-white py-14 border-t border-slate-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl bg-gradient-to-r from-blue-50 to-sky-50 p-6 sm:p-10 border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1d68ed] text-white shadow-md">
                  <Image
                    src={settings.logoUrl || connectDaetLogo}
                    alt=""
                    width={40}
                    height={40}
                    unoptimized
                    className="h-10 w-10 object-contain"
                  />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {settings.tourismOfficeName || 'Municipal Tourism & Cultural Development Office'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Municipal Hall Complex, Daet, Camarines Norte, Philippines
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/info/contact"
                  className="rounded-full bg-[#1d68ed] px-5 py-2.5 text-xs font-bold text-white shadow transition hover:bg-blue-600"
                >
                  Contact Tourist Desk
                </Link>
                <Link
                  href="/info/community-guidelines"
                  className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Community Guidelines
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <VisitorFooter />
    </div>
  )
}
