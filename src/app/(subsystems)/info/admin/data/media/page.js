import { redirect } from 'next/navigation'

export default function mediaPage() {
  redirect('/admin/data?tab=media')
}
