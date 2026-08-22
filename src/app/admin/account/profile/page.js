import { redirect } from 'next/navigation'

export default function profilePage() {
  redirect('/admin/account?tab=profile')
}
