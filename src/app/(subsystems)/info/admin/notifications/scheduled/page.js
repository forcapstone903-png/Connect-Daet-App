import { redirect } from 'next/navigation'

export default function ScheduledPage() {
  redirect('/info/admin/announcement?tab=scheduled')
}
