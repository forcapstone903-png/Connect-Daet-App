import { redirect } from 'next/navigation'

export default function scheduledPage() {
  redirect('/admin/notifications?tab=scheduled')
}
