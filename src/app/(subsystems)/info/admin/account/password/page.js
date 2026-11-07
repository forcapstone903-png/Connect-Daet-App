import { redirect } from 'next/navigation'

export default function PasswordPage() {
  redirect('/info/admin/account?tab=password')
}
