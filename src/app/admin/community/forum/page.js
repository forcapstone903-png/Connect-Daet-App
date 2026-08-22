import { redirect } from 'next/navigation'

export default function forumPage() {
  redirect('/admin/community?tab=forum')
}
