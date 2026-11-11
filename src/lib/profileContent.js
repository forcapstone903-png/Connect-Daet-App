import { getPostImages, getPostVideos } from '@/lib/postMedia'

export function filterProfilePosts(posts, tab) {
  if (tab === 'Overview') return posts.slice(0, 3)
  if (tab === 'All') return posts
  if (tab === 'Posts') return posts.filter((post) => post.type === 'Post' && !post.isRepost)
  if (tab === 'Blogs') return posts.filter((post) => post.type === 'Blog' && !post.isRepost)
  if (tab === 'Forums') return posts.filter((post) => post.type === 'Forum' && !post.isRepost)
  if (tab === 'Travel') return posts.filter((post) => post.type === 'Tourist Spot' && !post.isRepost)
  if (tab === 'Reposts') return posts.filter((post) => post.isRepost)
  if (tab === 'Photos') return posts.filter((post) => getPostImages(post).length > 0)
  if (tab === 'Videos') return posts.filter((post) => getPostVideos(post).length > 0)
  return posts
}

export function getProfileContentTabs(posts) {
  const tabs = ['Overview']
  const contentTabs = ['All', 'Posts', 'Blogs', 'Forums', 'Travel', 'Photos', 'Videos']

  for (const tab of contentTabs) {
    if (filterProfilePosts(posts, tab).length > 0) tabs.push(tab)
  }

  tabs.push('Reposts')
  return tabs
}
