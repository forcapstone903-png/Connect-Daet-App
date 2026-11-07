import { redirect } from 'next/navigation'

export default function moderationPage() {
  redirect('/admin/community?tab=moderation')
}
