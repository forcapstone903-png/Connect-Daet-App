import { redirect } from 'next/navigation'

export default function import_exportPage() {
  redirect('/admin/data?tab=import-export')
}
