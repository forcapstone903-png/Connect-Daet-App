import { redirect } from 'next/navigation'

export default function SendPage() {
  redirect('/info/admin/announcement?tab=send')
}
