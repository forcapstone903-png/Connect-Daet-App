import { redirect } from 'next/navigation'

export default function blogsPage() {
  redirect('/admin/content?tab=blogs')
}
