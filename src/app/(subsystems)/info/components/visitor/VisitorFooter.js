'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Camera } from 'lucide-react'
import { usePublicSettings } from '@/lib/usePublicSettings'
import connectDaetLogo from '@/app/(subsystems)/info/assets/images/logo.png'

export default function VisitorFooter() {
  const { settings } = usePublicSettings()
  const logoSource = settings.logoUrl || connectDaetLogo

  return (
    <footer className="relative overflow-hidden bg-[#071b43] text-white">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12">
          {/* Brand Info */}
          <div className="lg:col-span-4">
            <Link href="/info/visitor" className="inline-flex items-center gap-3 group">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 p-1.5 ring-1 ring-sky-400/30 transition-transform duration-300 group-hover:rotate-6">
                <Image
                  src={logoSource}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized={Boolean(settings.logoUrl)}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="text-xl font-black tracking-tight text-white">
                Connect <span className="text-sky-400 font-bold">Daet</span>
              </span>
            </Link>
            <p className="mt-3 text-sm font-medium text-slate-300">
              Explore. Engage. Experience Daet.
            </p>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-400">
              {settings.tagline || 'Your official digital gateway to the capital of Camarines Norte. Discover surf, heritage, culture, and cuisine.'}
            </p>
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-sky-400">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-300 font-medium">
              <li>
                <Link href="/info/visitor" className="transition hover:text-white hover:underline">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/info/visitor/tourist-spots" className="transition hover:text-white hover:underline">
                  Attractions
                </Link>
              </li>
              <li>
                <Link href="/info/visitor/events" className="transition hover:text-white hover:underline">
                  Events
                </Link>
              </li>
              <li>
                <Link href="/info/visitor/search?type=blogs" className="transition hover:text-white hover:underline">
                  Blogs
                </Link>
              </li>
              <li>
                <Link href="/info/visitor/forum" className="transition hover:text-white hover:underline">
                  Forums
                </Link>
              </li>
              <li>
                <Link href="/info/about" className="transition hover:text-white hover:underline">
                  About Daet
                </Link>
              </li>
            </ul>
          </div>

          {/* Follow Us / Socials */}
          <div className="lg:col-span-3">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-sky-400">
              Follow Us
            </h3>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {[
                { name: 'Facebook', label: 'f', href: 'https://facebook.com', bg: 'hover:bg-blue-600' },
                { name: 'YouTube', label: '▶', href: 'https://youtube.com', bg: 'hover:bg-red-600' },
                { name: 'TikTok', label: '♪', href: 'https://tiktok.com', bg: 'hover:bg-pink-600' },
                { name: 'Instagram', Icon: Camera, href: 'https://instagram.com', bg: 'hover:bg-purple-600' },
              ].map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.name}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-black text-white shadow-sm backdrop-blur transition-all duration-200 hover:scale-110 hover:border-transparent ${social.bg}`}
                >
                  {social.Icon ? <social.Icon className="h-4 w-4" aria-hidden="true" /> : social.label}
                </a>
              ))}
            </div>

            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-300">Need Tourist Assistance?</p>
              <Link
                href="/info/contact"
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 transition hover:text-sky-300 hover:underline"
              >
                Contact Tourism Office →
              </Link>
            </div>
          </div>

          {/* Architectural Church Illustration (right column matching image) */}
          <div className="hidden lg:col-span-3 lg:flex lg:flex-col lg:items-end lg:justify-end">
            <div className="relative w-64 h-36 opacity-85 transition-opacity hover:opacity-100">
              {/* Church Line-art SVG illustration */}
              <svg
                viewBox="0 0 240 140"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-full text-sky-400/40"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Church Silhouette Base */}
                <path d="M20 135 H220 V85 H20 Z" fill="#082256" stroke="currentColor" />
                {/* Central Tower */}
                <path d="M85 85 V35 H155 V85" fill="#09296b" stroke="currentColor" />
                {/* Central Spire Roof */}
                <path d="M75 35 L120 10 L165 35 Z" fill="#0a327f" stroke="currentColor" />
                {/* Cross on top */}
                <line x1="120" y1="5" x2="120" y2="10" stroke="#38bdf8" strokeWidth="2" />
                <line x1="117" y1="7" x2="123" y2="7" stroke="#38bdf8" strokeWidth="2" />
                {/* Belfry arches */}
                <path d="M100 65 C100 52 110 45 120 45 C130 45 140 52 140 65 V85 H100 Z" fill="#071b43" stroke="currentColor" />
                <circle cx="120" cy="55" r="3" fill="#38bdf8" />
                {/* Left Side Bell Tower */}
                <path d="M30 85 V45 H70 V85" fill="#09296b" stroke="currentColor" />
                <path d="M25 45 L50 25 L75 45 Z" fill="#0a327f" stroke="currentColor" />
                <path d="M42 65 C42 55 58 55 58 65 V85 H42 Z" fill="#071b43" stroke="currentColor" />
                {/* Right Side Bell Tower */}
                <path d="M170 85 V45 H210 V85" fill="#09296b" stroke="currentColor" />
                <path d="M165 45 L190 25 L215 45 Z" fill="#0a327f" stroke="currentColor" />
                <path d="M182 65 C182 55 198 55 198 65 V85 H182 Z" fill="#071b43" stroke="currentColor" />
                {/* Main entrance arch */}
                <path d="M105 135 V105 C105 95 135 95 135 105 V135" fill="#071b43" stroke="#38bdf8" strokeWidth="2" />
                {/* Palm silhouettes on sides */}
                <path d="M10 135 Q15 90 2 85" stroke="#38bdf8" strokeWidth="1.2" opacity="0.6" />
                <path d="M2 85 Q10 75 22 80 M2 85 Q-6 75 -2 88 M2 85 Q5 95 12 95" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
                <path d="M228 135 Q223 90 236 85" stroke="#38bdf8" strokeWidth="1.2" opacity="0.6" />
                <path d="M236 85 Q228 75 216 80 M236 85 Q244 75 240 88" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
              </svg>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Connect Daet. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span
              style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
              className="text-sm font-bold text-sky-300 drop-shadow-sm"
            >
              Discover Daet, Camarines Norte!
            </span>
            <span className="text-sky-400">✦</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
