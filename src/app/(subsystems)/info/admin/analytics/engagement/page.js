import { redirect } from 'next/navigation'

export default function engagementPage() {
  redirect('/admin/analytics?tab=engagement')
}
