const fs = require('fs');
const path = require('path');

const mappings = [
  { folder: 'src/app/(subsystems)/info/admin/account/2fa', redirect: '/info/admin/account?tab=2fa' },
  { folder: 'src/app/(subsystems)/info/admin/account/password', redirect: '/info/admin/account?tab=password' },
  { folder: 'src/app/(subsystems)/info/admin/account/profile', redirect: '/info/admin/account?tab=profile' },
  { folder: 'src/app/(subsystems)/info/admin/account/sessions', redirect: '/info/admin/account?tab=sessions' },
  { folder: 'src/app/(subsystems)/info/admin/analytics/content', redirect: '/info/admin/analytics?tab=content' },
  { folder: 'src/app/(subsystems)/info/admin/analytics/engagement', redirect: '/info/admin/analytics?tab=engagement' },
  { folder: 'src/app/(subsystems)/info/admin/analytics/reports', redirect: '/info/admin/analytics?tab=reports' },
  { folder: 'src/app/(subsystems)/info/admin/analytics/visitors', redirect: '/info/admin/analytics?tab=visitors' },
  { folder: 'src/app/(subsystems)/info/admin/community/feedback', redirect: '/info/admin/community?tab=feedback' },
  { folder: 'src/app/(subsystems)/info/admin/community/forum', redirect: '/info/admin/community?tab=forum' },
  { folder: 'src/app/(subsystems)/info/admin/community/moderation', redirect: '/info/admin/community?tab=moderation' },
  { folder: 'src/app/(subsystems)/info/admin/community/users', redirect: '/info/admin/community?tab=users' },
  { folder: 'src/app/(subsystems)/info/admin/content/attractions', redirect: '/info/admin/content?tab=attractions' },
  { folder: 'src/app/(subsystems)/info/admin/content/blogs', redirect: '/info/admin/content?tab=blogs' },
  { folder: 'src/app/(subsystems)/info/admin/content/events', redirect: '/info/admin/content?tab=events' },
  { folder: 'src/app/(subsystems)/info/admin/data/backups', redirect: '/info/admin/data?tab=backups' },
  { folder: 'src/app/(subsystems)/info/admin/data/import-export', redirect: '/info/admin/data?tab=import-export' },
  { folder: 'src/app/(subsystems)/info/admin/data/media', redirect: '/info/admin/data?tab=media' },
  { folder: 'src/app/(subsystems)/info/admin/data/retention', redirect: '/info/admin/data?tab=retention' },
  { folder: 'src/app/(subsystems)/info/admin/notifications/history', redirect: '/info/admin/notifications?tab=history' },
  { folder: 'src/app/(subsystems)/info/admin/notifications/scheduled', redirect: '/info/admin/notifications?tab=scheduled' },
  { folder: 'src/app/(subsystems)/info/admin/notifications/send', redirect: '/info/admin/notifications?tab=send' },
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