import { redirect } from 'next/navigation'

export default function securityPage() {
  redirect('/admin/settings?tab=security')
}
