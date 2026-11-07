import { redirect } from 'next/navigation'

export default function contentPage() {
  redirect('/admin/analytics?tab=content')
}
