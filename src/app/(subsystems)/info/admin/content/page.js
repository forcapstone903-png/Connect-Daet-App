import Link from 'next/link'
import { redirect } from 'next/navigation'

const CONTENT_WORKSPACES = {
  attractions: '/info/admin/tourist-spots',
  blogs: '/info/admin/blog',
  events: '/info/admin/events',
}

const workspaceCards = [
  {
    href: CONTENT_WORKSPACES.attractions,
    title: 'Tourist attractions',
    description: 'Manage Daet destinations, visitor details, images, and publication status.',
    icon: '📍',
  },
  {
    href: CONTENT_WORKSPACES.blogs,
    title: 'Blogs and articles',
    description: 'Create and publish travel guides, local stories, and announcements.',
    icon: '📝',
  },
  {
    href: CONTENT_WORKSPACES.events,
    title: 'Events',
    description: 'Manage community events, schedules, venues, and event status.',
    icon: '📅',
  },
]

export default async function AdminContentPage({ searchParams }) {
  const params = await searchParams
  const tab = Array.isArray(params?.tab) ? params.tab[0] : params?.tab
  if (tab && CONTENT_WORKSPACES[tab]) redirect(CONTENT_WORKSPACES[tab])

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/info/admin/dashboard" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          ← Admin dashboard
        </Link>
        <header className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">Admin workspace</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Content management</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Choose a content area to manage the information shown across Connect Daet.
          </p>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {workspaceCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              <span className="text-2xl" aria-hidden="true">{card.icon}</span>
              <h2 className="mt-4 text-lg font-bold text-slate-900 group-hover:text-sky-800">{card.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              <span className="mt-5 inline-block text-sm font-bold text-sky-700">Open workspace →</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
