import { redirect } from 'next/navigation'

export default function amenitiesPage() {
  redirect('/admin/content?tab=amenities')
}
