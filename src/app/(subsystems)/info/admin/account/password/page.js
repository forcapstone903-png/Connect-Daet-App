import { redirect } from 'next/navigation'

export default function passwordPage() {
  redirect('/admin/account?tab=password')
}
