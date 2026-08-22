import { redirect } from 'next/navigation'

export default function backupsPage() {
  redirect('/admin/data?tab=backups')
}
