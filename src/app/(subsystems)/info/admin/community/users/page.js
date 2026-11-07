import { redirect } from 'next/navigation'

export default function usersPage() {
  redirect('/admin/community?tab=users')
}
