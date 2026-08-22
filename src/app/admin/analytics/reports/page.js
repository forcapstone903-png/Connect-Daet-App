import { redirect } from 'next/navigation'

export default function reportsPage() {
  redirect('/admin/analytics?tab=reports')
}
