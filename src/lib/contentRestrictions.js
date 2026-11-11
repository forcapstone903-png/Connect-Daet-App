export async function getActivePublishingRestriction(client, userId) {
  const { data, error } = await client
    .from('admin_user_bans')
    .select('reason')
    .eq('user_id', userId)
    .is('lifted_at', null)
    .maybeSingle()
  if (error) throw error
  return data || null
}
