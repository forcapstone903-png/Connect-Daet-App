import { redirect } from 'next/navigation'

export default function ProfilePage() {
  redirect('/info/admin/account?tab=profile')
}
