import { redirect } from 'next/navigation'

export default function EventsPage() {
  redirect('/info/admin/content?tab=events')
}
