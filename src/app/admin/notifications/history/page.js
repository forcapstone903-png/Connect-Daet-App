import { redirect } from 'next/navigation'

export default function historyPage() {
  redirect('/admin/notifications?tab=history')
}
