import { fail } from '@/lib/alertsServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST() {
  return fail(401, 'Please sign in to manage alert subscriptions.')
}

export async function DELETE() {
  return fail(401, 'Please sign in to manage alert subscriptions.')
}
