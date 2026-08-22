import { redirect } from 'next/navigation'

export default function generalPage() {
  redirect('/admin/settings?tab=general')
}
