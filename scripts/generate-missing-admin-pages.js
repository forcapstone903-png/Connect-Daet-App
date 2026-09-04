const fs = require('fs');
const path = require('path');

const mappings = [
  { folder: 'src/app/admin/account/2fa', redirect: '/admin/account?tab=2fa' },
  { folder: 'src/app/admin/account/password', redirect: '/admin/account?tab=password' },
  { folder: 'src/app/admin/account/profile', redirect: '/admin/account?tab=profile' },
  { folder: 'src/app/admin/account/sessions', redirect: '/admin/account?tab=sessions' },
  { folder: 'src/app/admin/analytics/content', redirect: '/admin/analytics?tab=content' },
  { folder: 'src/app/admin/analytics/engagement', redirect: '/admin/analytics?tab=engagement' },
  { folder: 'src/app/admin/analytics/reports', redirect: '/admin/analytics?tab=reports' },
  { folder: 'src/app/admin/analytics/visitors', redirect: '/admin/analytics?tab=visitors' },
  { folder: 'src/app/admin/community/feedback', redirect: '/admin/community?tab=feedback' },
  { folder: 'src/app/admin/community/forum', redirect: '/admin/community?tab=forum' },
  { folder: 'src/app/admin/community/moderation', redirect: '/admin/community?tab=moderation' },
  { folder: 'src/app/admin/community/users', redirect: '/admin/community?tab=users' },
  { folder: 'src/app/admin/content/amenities', redirect: '/admin/content?tab=amenities' },
  { folder: 'src/app/admin/content/attractions', redirect: '/admin/content?tab=attractions' },
  { folder: 'src/app/admin/content/blogs', redirect: '/admin/content?tab=blogs' },
  { folder: 'src/app/admin/content/events', redirect: '/admin/content?tab=events' },
  { folder: 'src/app/admin/data/backups', redirect: '/admin/data?tab=backups' },
  { folder: 'src/app/admin/data/import-export', redirect: '/admin/data?tab=import-export' },
  { folder: 'src/app/admin/data/media', redirect: '/admin/data?tab=media' },
  { folder: 'src/app/admin/data/retention', redirect: '/admin/data?tab=retention' },
  { folder: 'src/app/admin/notifications/history', redirect: '/admin/notifications?tab=history' },
  { folder: 'src/app/admin/notifications/scheduled', redirect: '/admin/notifications?tab=scheduled' },
  { folder: 'src/app/admin/notifications/send', redirect: '/admin/notifications?tab=send' },
];

for (const { folder, redirect } of mappings) {
  const dir = path.join(process.cwd(), folder);
  fs.mkdirSync(dir, { recursive: true });
  const pagePath = path.join(dir, 'page.js');
  const rawName = folder.split('/').pop().replace(/[^a-zA-Z0-9]/g, '_');
  const componentName = (rawName.charAt(0).toUpperCase() + rawName.slice(1)).replace(/^\d/, 'P') + 'Page';
  const content = `import { redirect } from 'next/navigation'

export default function ${componentName}() {
  redirect('${redirect}')
}
`;
  fs.writeFileSync(pagePath, content);
}

console.log(`Created ${mappings.length} redirect pages.`);