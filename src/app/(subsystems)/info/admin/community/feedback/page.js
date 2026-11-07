import { redirect } from 'next/navigation'

export default function feedbackPage() {
  redirect('/admin/community?tab=feedback')
}
