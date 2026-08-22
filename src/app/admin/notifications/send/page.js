import { redirect } from 'next/navigation'

export default function sendPage() {
  redirect('/admin/notifications?tab=send')
}
