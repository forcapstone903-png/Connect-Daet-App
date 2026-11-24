import { BookOpen, CalendarDays, Home, Info, Landmark, MessageSquare } from 'lucide-react'

export const visitorNavigationItems = [
  { href: '/info/visitor', label: 'Home', icon: Home, exact: true },
  { href: '/info/visitor/tourist-spots', label: 'Attractions', icon: Landmark },
  { href: '/info/visitor/events', label: 'Events', icon: CalendarDays },
  {
    href: '/info/visitor/search?type=blogs',
    label: 'Blogs',
    icon: BookOpen,
    defaultParams: { type: 'blogs' },
    matchPrefix: '/info/visitor/search',
    matchPaths: ['/info/visitor/blog'],
  },
  { href: '/info/visitor/forum', label: 'Forums', icon: MessageSquare },
  { href: '/info/about', label: 'About', icon: Info, mobileShell: false },
]

export const visitorMobileNavigationItems = visitorNavigationItems.filter((item) => item.mobileShell !== false)