'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Home,
  Info,
  Landmark,
  Menu,
  Newspaper,
  User,
  Users,
  X,
} from 'lucide-react'
import { usePublicSettings } from '@/lib/usePublicSettings'
import connectDaetLogo from '@/app/(subsystems)/info/assets/images/logo.png'

const NAV_ITEMS = [
  { href: '/info/visitor', label: 'Home', icon: Home, exact: true },
  { href: '/info/visitor/tourist-spots', label: 'Attractions', icon: Landmark },
  { href: '/info/visitor/events', label: 'Events', icon: CalendarDays },
  { href: '/info/visitor/search?type=blogs', label: 'Blogs', icon: Newspaper, matchPrefix: '/info/visitor/search' },
  { href: '/info/visitor/forum', label: 'Forums', icon: Users },
  { href: '/info/about', label: 'About', icon: Info },
]

export default function VisitorNavbar({ alertsCount = 0, transparent = false }) {
  const pathname = usePathname()
  const { settings } = usePublicSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuOpenPathname, setMenuOpenPathname] = useState(pathname)
  const [scrolled, setScrolled] = useState(false)
  const isMenuOpen = menuOpen && menuOpenPathname === pathname

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const isNavActive = (item) => {
    if (item.exact) return pathname === item.href
    if (item.matchPrefix) return pathname.startsWith(item.matchPrefix)
    return pathname.startsWith(item.href)
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || !transparent
          ? 'bg-[#081c49]/95 backdrop-blur-md shadow-lg shadow-black/10 border-b border-white/10'
          : 'bg-gradient-to-b from-[#081c49]/80 to-transparent backdrop-blur-[2px]'
      }`}
    >
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <Link
          href="/info/visitor"
          className="group flex min-w-0 items-center gap-2.5 transition-transform duration-200 hover:scale-[1.02]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 p-1.5 ring-1 ring-sky-400/30 transition-transform duration-300 group-hover:rotate-6">
            <Image
              src={settings.logoUrl || connectDaetLogo}
              alt=""
              width={36}
              height={36}
              unoptimized
              className="h-full w-full object-contain filter drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
            />
          </span>
          <div className="flex flex-col">
            <span className="truncate text-base font-black tracking-tight text-white sm:text-lg">
              Connect <span className="text-sky-400 font-bold">Daet</span>
            </span>
          </div>
        </Link>

        {/* Center Pill Navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur-md shadow-inner lg:flex"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isNavActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#1d68ed] text-white shadow-md shadow-blue-500/25 scale-[1.02]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Right Actions: Notifications & Login */}
        <div className="flex items-center gap-3">
          <Link
            href="/info/visitor/alerts"
            aria-label="View alerts and notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-200 transition-all hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {alertsCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-[#081c49] animate-pulse">
                {alertsCount > 9 ? '9+' : alertsCount}
              </span>
            )}
          </Link>

          <Link
            href="/info/login"
            className="group hidden items-center gap-2 rounded-full bg-white px-5 py-2 text-xs font-bold text-slate-800 shadow-md transition-all duration-200 hover:bg-slate-50 hover:shadow-lg hover:scale-105 active:scale-95 sm:inline-flex"
          >
            <User className="h-3.5 w-3.5 text-slate-600 transition-transform group-hover:scale-110" aria-hidden="true" />
            <span>Login</span>
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => {
              const nextOpen = !isMenuOpen
              setMenuOpen(nextOpen)
              if (nextOpen) setMenuOpenPathname(pathname)
            }}
            aria-expanded={isMenuOpen}
            aria-controls="visitor-nav-menu"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white backdrop-blur transition hover:bg-white/20 lg:hidden"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMenuOpen && (
        <nav
          id="visitor-nav-menu"
          aria-label="Mobile navigation"
          className="border-t border-white/10 bg-[#081c49]/98 px-5 pb-6 pt-3 text-white backdrop-blur-xl lg:hidden animate-in slide-in-from-top-3 duration-250"
        >
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const active = isNavActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active ? 'bg-[#1d68ed] text-white shadow-sm' : 'text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/50" />
                </Link>
              )
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <Link
              href="/info/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-full border border-white/20 bg-white/5 py-2.5 text-center text-xs font-bold text-white transition hover:bg-white/10"
            >
              Sign In
            </Link>
            <Link
              href="/info/register"
              onClick={() => setMenuOpen(false)}
              className="rounded-full bg-[#1d68ed] py-2.5 text-center text-xs font-bold text-white shadow-md transition hover:bg-blue-600"
            >
              Register
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
