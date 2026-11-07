import { redirect } from 'next/navigation'

export default function BlogsPage() {
  redirect('/info/admin/content?tab=blogs')
}
