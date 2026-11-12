import { unstable_cache } from 'next/cache'
import { getSettingsClient } from '@/lib/appSettingsServer'

export const getPublishedFaqs = unstable_cache(
  async () => {
    const client = getSettingsClient()
    if (!client) throw new Error('FAQ database is not configured on the server.')

    const { data, error } = await client
      .from('info_faqs')
      .select('id, question, answer, sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })

    if (error) {
      console.error('Published FAQ load failed:', error)
      throw new Error('Unable to load published FAQs.')
    }

    return data || []
  },
  ['published-faqs-v1'],
  { tags: ['published-faqs'], revalidate: 300 }
)
