import { redirect } from 'next/navigation'

export default function visitorsPage() {
  redirect('/admin/analytics?tab=visitors')
}
