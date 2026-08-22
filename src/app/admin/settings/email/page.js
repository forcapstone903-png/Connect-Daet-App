import { redirect } from 'next/navigation'

export default function emailPage() {
  redirect('/admin/settings?tab=email')
}
