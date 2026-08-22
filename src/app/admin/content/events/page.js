import { redirect } from 'next/navigation'

export default function eventsPage() {
  redirect('/admin/content?tab=events')
}
