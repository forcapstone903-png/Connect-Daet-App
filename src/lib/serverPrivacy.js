export async function getPrivateProfileMessagingAccess(adminSupabase, viewerId, profileId) {
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('privacy_level, is_public')
    .eq('user_id', profileId)
    .maybeSingle()
  if (profileError) return { allowed: false, error: profileError }

  const privacyLevel = profile?.is_public === false
    ? (['followers', 'private'].includes(profile.privacy_level) ? profile.privacy_level : 'followers')
    : profile?.privacy_level || 'public'
  if (privacyLevel === 'public') return { allowed: true, error: null }

  const { data: follow, error: followError } = await adminSupabase
    .from('user_follows')
    .select('id')
    .eq('follower_id', viewerId)
    .eq('following_id', profileId)
    .maybeSingle()
  return { allowed: Boolean(follow), error: followError }
}
