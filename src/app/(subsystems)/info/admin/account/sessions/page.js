import { redirect } from 'next/navigation'

export default function SessionsPage() {
  redirect('/info/admin/account?tab=sessions')
}
