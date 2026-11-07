import { redirect } from 'next/navigation'

export default function TwoFaPage() {
  redirect('/admin/account?tab=2fa')
}
