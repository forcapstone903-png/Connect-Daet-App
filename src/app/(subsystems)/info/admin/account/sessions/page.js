import { redirect } from 'next/navigation'

export default function sessionsPage() {
  redirect('/admin/account?tab=sessions')
}
