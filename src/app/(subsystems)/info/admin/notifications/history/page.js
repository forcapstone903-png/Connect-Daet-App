import { redirect } from 'next/navigation'

export default function HistoryPage() {
  redirect('/info/admin/announcement?tab=history')
}
