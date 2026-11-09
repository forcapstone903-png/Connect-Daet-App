'use client'

import { useParams } from 'next/navigation'
import EventDetailsView from '@/app/(subsystems)/info/components/user/EventDetailsView'

export default function PublicEventDetailPage() {
  const params = useParams()
  return <EventDetailsView key={String(params?.id)} eventId={params?.id} backHref="/info/visitor/events" />
}
