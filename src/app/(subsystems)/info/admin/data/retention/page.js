import { redirect } from 'next/navigation'

export default function retentionPage() {
  redirect('/admin/data?tab=retention')
}
