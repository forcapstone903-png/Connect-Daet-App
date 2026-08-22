import { redirect } from 'next/navigation'

export default function attractionsPage() {
  redirect('/admin/content?tab=attractions')
}
