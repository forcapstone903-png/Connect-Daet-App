import { BookOpen, CalendarDays, Home, MapPin, MessageSquare } from 'lucide-react'

export const visitorNavigationItems = [
  { href: '/info/visitor', label: 'Home', icon: Home, exact: true },
  { href: '/info/visitor/tourist-spots', label: 'Travels', icon: MapPin },
  { href: '/info/visitor/events', label: 'Events', icon: CalendarDays },
  {
    href: '/info/visitor/search?type=blogs',
    label: 'Blogs',
    icon: BookOpen,
    defaultParams: { type: 'blogs' },
    matchPaths: ['/info/visitor/blog'],
  },
  { href: '/info/visitor/forum', label: 'Forum', icon: MessageSquare },
]

export const visitorMobileNavigationItems = visitorNavigationItems