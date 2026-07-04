# Supabase Implementation Checklist

## Phase 1: Project Setup ✓

### Step 1.1: Create Supabase Project
- [ ] Go to https://supabase.com
- [ ] Click "New Project"
- [ ] Select region (closest to Daet, Philippines)
- [ ] Create database password (save securely)
- [ ] Wait for project to initialize (2-5 minutes)
- [ ] Save these credentials:
  - [ ] Project URL: `https://your-project.supabase.co`
  - [ ] Anon Key: `eyJhbGc...`
  - [ ] Service Role Key: `eyJhbGc...` (keep secret!)

### Step 1.2: Update Environment Variables
1. Open `.env.local` in your project root
2. Add/update:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
3. Save file

### Step 1.3: Verify Connection
1. In terminal, run:
   ```bash
   npm install @supabase/supabase-js
   ```
2. Test connection:
   ```bash
   node -e "
   const { createClient } = require('@supabase/supabase-js');
   const sb = createClient(
     'YOUR_URL', 
     'YOUR_KEY'
   );
   sb.from('schema_information').select().limit(1).then(r => console.log('Connected!', r.data?.length === 0)).catch(e => console.error(e.message));
   "
   ```

---

## Important Notes

### PostGIS Geographic Features (Optional)
- **Latitude/Longitude columns** are included in all tables for future use
- **Geographic search** (nearby amenities) is NOT required for the app to work
- If PostGIS is available on your tier, geographic features can be enabled later
- The app includes fallback non-geographic search using full-text search

### What Works Without PostGIS ✅
- ✅ All CRUD operations (Create, Read, Update, Delete)
- ✅ Full-text search across content
- ✅ User authentication
- ✅ File uploads
- ✅ Blog comments
- ✅ Event management
- ✅ Announcements
- ✅ Moderation system

### Geographic Features (Requires PostGIS) 🗺️
- ❌ Find nearby amenities (within X km)
- ❌ Geographic search by location
- ❌ Radius-based queries

---

### Step 2.0: Enable PostGIS Extension (OPTIONAL - For Geographic Features)
**ℹ️ PostGIS is OPTIONAL** - Not all Supabase tiers support it

If geographic features (nearby search) are needed:
1. Open Supabase Dashboard → SQL Editor
2. Create new query and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "postgis";
   ```
3. If successful (green checkmark), geographic features are enabled
4. If fails (error), your Supabase tier doesn't support PostGIS - that's OK, app still works!

**Note:** Database schema is designed to work WITHOUT PostGIS. Geographic indexes are commented out for compatibility.

### Step 2.1: Run Schema Migration
1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy all content from `supabase/migrations/001_init_schema.sql`
4. Paste into SQL Editor
5. Click "Run"
6. Wait for completion (should see green checkmark)

**What this creates:**
- `info_users` - User management
- `info_amenities` - Amenities/services
- `info_events` - Events calendar
- `info_blogs` - Blog posts
- `info_announcements` - Admin announcements
- `info_tourist_spots` - Attractions
- `info_moderation` - Moderation reports
- `info_password_resets` - Password reset tokens
- `info_comments` - Blog comments
- `info_audit_log` - Audit trail
- Plus all indexes

### Step 2.2: Run RLS Policies
1. Create new SQL query in Supabase
2. Copy all content from `supabase/migrations/002_rls_policies.sql`
3. Paste and run
4. Verify: Tables → info_users → RLS should be "ON"

**What this enables:**
- Row-level security for all tables
- User authentication checks
- Admin/moderator role enforcement
- Content visibility rules

### Step 2.3: Run Helper Functions
1. Create new SQL query
2. Copy all content from `supabase/migrations/003_functions_and_helpers.sql`
3. Paste and run
4. Verify: Database → Functions should list new functions

**What this creates:**
- `is_admin()` - Check admin status
- `is_moderator()` - Check moderator status
- `search_content()` - Full-text search
- `get_upcoming_events()` - Event queries
- `generate_password_reset_token()` - Auth helpers
- And 10+ more utility functions

---

## Phase 3: Storage Setup 📁

### Step 3.1: Create Storage Buckets
1. Go to Supabase Dashboard → Storage
2. Click "New Bucket"
3. For each bucket below, create it:

| Bucket Name | Public? | Max Size | Purpose |
|---|---|---|---|
| amenities | Yes | 10MB | Amenity photos |
| events | Yes | 50MB | Event images/videos |
| blogs | Yes | 10MB | Blog featured images |
| tourist-spots | Yes | 50MB | Attraction photos |
| user-profiles | Yes | 5MB | User profile pictures |
| announcements | Yes | 5MB | Announcement graphics |

### Step 3.2: Configure Storage Policies
1. Supabase → Storage → Select bucket
2. Click "Policies" tab
3. For each bucket, create these policies:

**Policy 1: Public Read**
```sql
CREATE POLICY "Public Read" ON storage.objects
  FOR SELECT USING (bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'announcements'));
```

**Policy 2: Authenticated Upload**
```sql
CREATE POLICY "Authenticated Upload" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated' 
    AND bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'user-profiles', 'announcements')
  );
```

---

## Phase 4: Initial Data Setup 📊

### Step 4.1: Create Admin User
1. Open SQL Editor in Supabase
2. Run this query (change values):
```sql
INSERT INTO public.info_users (
  email, password, full_name, user_type, status
) VALUES (
  'admin@daet-tourism.com',
  'SecureAdminPassword123!',
  'Daet Tourism Admin',
  'admin',
  'active'
);
```
3. Note the returned `id` value
4. Store credentials securely

### Step 4.2: Create Test Data (Optional)
Run from `supabase/queries/sample_data.sql`:
```sql
-- Add sample amenities
INSERT INTO public.info_amenities (name, type, location, created_by, status) VALUES
  ('Bagasbas Beach Resort', 'accommodation', 'Bagasbas', 'admin-id', 'active'),
  ('The Singing Sands Bistro', 'restaurant', 'Daet', 'admin-id', 'active'),
  ('Calaguas Ferry', 'transport', 'Port Area', 'admin-id', 'active');

-- Add sample event
INSERT INTO public.info_events (
  title, category, location, start_date, created_by, status
) VALUES (
  'Daet Tourism Festival', 'festival', 'Bagasbas Beach',
  '2025-02-15', 'admin-id', 'published'
);
```

---

## Phase 5: Frontend Integration 💻

### Step 5.1: Import Utils in Components
```javascript
import { 
  getAmenities, 
  getEvents, 
  getBlogs,
  uploadMedia 
} from '@/lib/supabaseUtils';
```

### Step 5.2: Implement Authentication
```javascript
// In login page
import { loginUser } from '@/lib/supabaseUtils';

const handleLogin = async (email, password) => {
  const result = await loginUser(email, password);
  if (result.success) {
    sessionStorage.setItem('user_session', JSON.stringify(result.user));
    router.push('/dashboard');
  } else {
    setError(result.error);
  }
};
```

### Step 5.3: Fetch and Display Content
```javascript
// In amenities page
useEffect(() => {
  const fetchAmenities = async () => {
    const result = await getAmenities({ type: 'restaurant' });
    if (result.success) {
      setAmenities(result.data);
    }
  };
  fetchAmenities();
}, []);
```

### Step 5.4: Handle File Uploads
```javascript
// In media upload component
const handleUpload = async (file) => {
  const result = await uploadMedia('amenities', file, 'photos');
  if (result.success) {
    setImageUrl(result.url);
    // Update amenity form
  }
};
```

---

## Phase 6: Testing ✅

### Step 6.1: Test Database Connection
```bash
npm run dev
```
Open browser → Network tab → Check for successful Supabase API calls

### Step 6.2: Test Authentication
1. Go to login page
2. Enter admin credentials created in Phase 4
3. Verify session storage shows user data
4. Check admin dashboard loads

### Step 6.3: Test CRUD Operations
1. Create new amenity:
   - Go to admin/amenities
   - Click "Add Amenity"
   - Fill form and submit
   - Verify in database

2. Update content:
   - Edit amenity
   - Verify changes saved
   - Check updated_at timestamp

3. Delete content:
   - Delete amenity
   - Verify removed from UI
   - Check database

### Step 6.4: Test Search Functionality
1. Go to main search
2. Search for "restaurant"
3. Verify results from amenities, blogs, events
4. Check relevance ordering

### Step 6.5: Test File Uploads
1. Try uploading image
2. Verify file appears in storage bucket
3. Verify public URL works
4. Test different file types

---

## Phase 7: Optimization 🚀

### Step 7.1: Enable Database Functions
These should run automatically after schema setup:
- Triggers for `updated_at` timestamps
- Full-text search indexing
- GIS functions for location searches

### Step 7.2: Monitor Performance
1. Supabase Dashboard → Database → Query Analysis
2. Look for slow queries
3. Adjust indexes if needed

### Step 7.3: Set Up Backups
1. Supabase Dashboard → Settings → Backups
2. Enable automatic backups (daily recommended)
3. Test restore procedure

---

## Phase 8: Production Readiness 🔒

### Step 8.1: Security Checklist
- [ ] Never commit service_role_key to Git
- [ ] Use `.env.local` (add to .gitignore)
- [ ] Enable HTTPS in production
- [ ] Set strong database password
- [ ] Enable 2FA for Supabase account
- [ ] Review RLS policies are correct
- [ ] Test as unauthenticated user (should fail)

### Step 8.2: Configure Rate Limiting
1. Supabase → API → Rate Limiting
2. Set limits per IP/user to prevent abuse

### Step 8.3: Set Up Monitoring
1. Supabase → Database → Realtime
2. Supabase → Authentication → Providers
3. Set up alerts for errors/slowdowns

### Step 8.4: Deploy to Production
1. Build app: `npm run build`
2. Update `.env.production` with production Supabase keys
3. Deploy to hosting (Vercel recommended)
4. Run smoke tests in production

---

## Common Issues & Solutions

### Issue: "PGRST116 - No rows found"
**Solution:** RLS policy blocking access
- Check user is authenticated
- Verify RLS policy allows SELECT
- Test with admin role

### Issue: "Bucket not found"
**Solution:** Storage bucket doesn't exist
- Go to Supabase Storage
- Create missing bucket
- Verify bucket name matches code

### Issue: Slow queries
**Solution:** Missing indexes or inefficient query
- Run: `EXPLAIN ANALYZE select ...`
- Check missing indexes
- Add index on frequently filtered columns

### Issue: "Permission denied"
**Solution:** RLS policy too restrictive
- Verify policy allows operation
- Check user type matches policy condition
- Use service_role_key for admin operations only

### Issue: File upload fails
**Solution:** Policy or file size issue
- Check storage policy exists
- Verify file size under bucket limit
- Check MIME type is allowed

---

## Maintenance Schedule

### Daily
- Monitor error logs in dashboard
- Check for pending moderation reports
- Verify backups completed

### Weekly
- Review slow queries
- Check user engagement stats
- Clean up expired password reset tokens

### Monthly
- Analyze usage trends
- Review and optimize indexes
- Update security settings
- Test disaster recovery

### Quarterly
- Review RLS policies
- Update stored procedures
- Performance tuning
- Security audit

---

## File Structure Reference

```
project-root/
├── supabase/
│   ├── migrations/
│   │   ├── 001_init_schema.sql      ← Create tables
│   │   ├── 002_rls_policies.sql     ← Enable RLS
│   │   └── 003_functions_and_helpers.sql ← Add functions
│   └── queries/
│       ├── common_operations.sql    ← Useful queries
│       └── sample_data.sql          ← Test data
├── src/
│   └── lib/
│       ├── supabaseClient.js        ← Client config
│       └── supabaseUtils.js         ← API helpers
├── .env.local                       ← Local secrets
└── SUPABASE_SETUP.md                ← This file
```

---

## Quick Reference

### Login/Register
```javascript
import { loginUser, registerUser } from '@/lib/supabaseUtils';
```

### Fetch Data
```javascript
import { getAmenities, getEvents, getBlogs } from '@/lib/supabaseUtils';
```

### Create/Update
```javascript
import { createAmenity, updateAmenity } from '@/lib/supabaseUtils';
```

### Upload Files
```javascript
import { uploadMedia } from '@/lib/supabaseUtils';
```

### Search
```javascript
import { searchContent } from '@/lib/supabaseUtils';
```

---

## Next Steps

1. **Complete Phase 1-4** - Set up Supabase project and database
2. **Test in Phase 6** - Verify everything works
3. **Implement Phase 5** - Add to your Next.js app
4. **Deploy Phase 8** - Go live!

---

## Support Resources

- 📚 [Supabase Docs](https://supabase.com/docs)
- 🐘 [PostgreSQL Docs](https://www.postgresql.org/docs/)
- 🗺️ [PostGIS Docs](https://postgis.net/docs/)
- 🔍 [Full-Text Search Guide](https://www.postgresql.org/docs/current/textsearch.html)
- 🆘 [Supabase Community](https://discord.supabase.io)

---

**Last Updated:** June 13, 2026
**Version:** 1.0
**Status:** Ready for Implementation
