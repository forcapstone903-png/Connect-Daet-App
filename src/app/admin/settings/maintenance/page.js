import { redirect } from 'next/navigation'

export default function maintenancePage() {
  redirect('/admin/settings?tab=maintenance')
}
