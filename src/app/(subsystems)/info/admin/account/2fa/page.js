import { redirect } from 'next/navigation'

export default function PfaPage() {
  redirect('/info/admin/account?tab=2fa')
}
