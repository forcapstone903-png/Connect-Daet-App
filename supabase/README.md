# Supabase Configuration for Connect-DAET Application

This directory contains all Supabase configuration, database schemas, and helper utilities for the Connect-DAET tourism application.

## 📁 Directory Structure

```
supabase/
├── migrations/              # Database migration files (run in order)
│   ├── 001_init_schema.sql                    # Core database tables and indexes
│   ├── 002_rls_policies.sql                   # Row-level security policies
│   ├── 003_functions_and_helpers.sql          # PostgreSQL functions and helpers
│   └── sample_data.sql                        # Test/demo data
├── queries/                 # Common SQL queries
│   └── common_operations.sql                  # Useful queries for operations
└── README.md               # This file
```

## 🚀 Quick Start

### 1. Create Supabase Project
```bash
# Go to https://supabase.com and create a new project
# Note your credentials:
# - Project URL
# - Anon Key
# - Service Role Key
```

### 2. Configure Environment
```bash
# Update .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Run Migrations
In Supabase Dashboard → SQL Editor, execute in order:
1. `migrations/001_init_schema.sql` - Create tables
2. `migrations/002_rls_policies.sql` - Enable security
3. `migrations/003_functions_and_helpers.sql` - Add functions
4. `migrations/sample_data.sql` - (Optional) Load test data

### 4. Set Up Storage
Create these storage buckets in Supabase Dashboard → Storage:
- `amenities` (public)
- `events` (public)
- `blogs` (public)
- `tourist-spots` (public)
- `user-profiles` (public)
- `announcements` (public)

## 📄 File Descriptions

### Migrations

#### 001_init_schema.sql
**Purpose:** Creates all database tables and indexes

**Tables Created:**
- `info_users` - User accounts and profiles
- `info_amenities` - Tourism amenities (hotels, restaurants, etc.)
- `info_events` - Event calendar and scheduling
- `info_blogs` - Blog posts and articles
- `info_announcements` - Admin announcements
- `info_tourist_spots` - Tourist attractions and POIs
- `info_moderation` - Moderation and reports
- `info_password_resets` - Password reset tokens
- `info_comments` - Blog comments
- `info_audit_log` - Admin action audit trail

**Key Features:**
- Full-text search vectors for content discovery
- Geographic indexes using PostGIS (lat/long)
- Automatic `updated_at` timestamp triggers
- Comprehensive indexing for performance

**Execution Time:** 2-5 seconds
**Size:** ~15KB

---

#### 002_rls_policies.sql
**Purpose:** Enables Row-Level Security to control data access

**Security Features:**
- Public can view published content
- Users can only modify their own content
- Admins can access and modify everything
- Moderators have elevated permissions
- Sensitive data is user-restricted

**Policy Highlights:**
- `is_admin()` function - Check admin status
- `is_moderator()` function - Check moderator status
- Role-based policies for each table
- Public/authenticated/owner-based access rules

**Execution Time:** 2-3 seconds
**Size:** ~18KB

---

#### 003_functions_and_helpers.sql
**Purpose:** Creates PostgreSQL functions for common operations

**Functions Created (15+):**
- `search_content()` - Full-text search across all content
- `get_amenities_by_category()` - Filter amenities
- `get_nearby_amenities()` - Geographic search (within radius)
- `get_upcoming_events()` - Events query
- `get_featured_amenities()` - Featured content
- `get_blog_posts()` - Blog with comment counts
- `generate_password_reset_token()` - Auth
- `verify_and_use_reset_token()` - Auth
- `get_user_statistics()` - Dashboard stats
- `get_content_statistics()` - Content stats
- `log_audit_action()` - Audit logging
- `deactivate_expired_announcements()` - Maintenance
- `cleanup_expired_reset_tokens()` - Maintenance

**Execution Time:** 3-5 seconds
**Size:** ~25KB

---

#### sample_data.sql
**Purpose:** Provides test data for development and testing

**Data Included:**
- 6 users (admin, moderator, business owner, 3 tourists)
- 9 amenities (hotels, restaurants, transport)
- 5 events (festivals, tours, workshops)
- 5 blog posts with various categories
- 4 announcements
- 5 tourist spots
- 2 blog comments

**Usage:**
1. Run migrations 001-003 first
2. Run this file to populate test data
3. Login with: `admin@daet-tourism.com` / `Admin@123456`

**Execution Time:** 2-3 seconds
**Size:** ~12KB

---

### Queries

#### common_operations.sql
**Purpose:** Reference collection of useful SQL queries

**Query Categories:**
1. **Dashboard Statistics** - User and content counts
2. **Trending & Popular** - Top-rated content
3. **Geographic Queries** - Location-based searches using PostGIS
4. **Search & Filter** - Advanced filtering with full-text search
5. **User Analytics** - User behavior and engagement
6. **Moderation & Safety** - Reports and security
7. **Audit & Compliance** - Admin actions and data exports
8. **Content Management** - Draft review and missing data
9. **Data Maintenance** - Orphaned records and cleanup
10. **Performance Tuning** - Query analysis and optimization

**Usage:**
- Copy queries as-is and run in Supabase SQL Editor
- Modify WHERE clauses for your specific needs
- Use for dashboards, reports, and analysis

---

## 🔐 Security Architecture

### Row-Level Security (RLS)
- **Enabled on all tables** - Default deny policy
- **User-based policies** - Users see their own data
- **Role-based policies** - Admins see all data
- **Content-based policies** - Public/draft filtering

### Authentication Flow
1. User logs in with email/password
2. User data stored in `info_users` table
3. Session stored in browser sessionStorage
4. RLS policies enforce access control
5. JWT claims verified for each request

### Storage Security
- Buckets are public for media viewing
- Upload restricted to authenticated users
- Delete restricted to file owner
- Files are immutable once uploaded

## 📊 Database Schema Highlights

### Tables Structure
```
Users → Creates → Amenities/Events/Blogs/Comments
Users → Reports → Moderation
Users → Receives → Announcements
Users → Can Reset → Password Resets
```

### Relationships
```
info_users.id ←→ info_amenities.created_by (1:N)
info_users.id ←→ info_events.created_by (1:N)
info_blogs.id ←→ info_comments.blog_id (1:N)
info_blogs.created_by ←→ info_users.id (N:1)
```

### Key Indexes
- Email (users) - for login lookup
- Type/Status - for filtering
- Search vectors - for full-text search
- Geographic (PostGIS) - for location queries
- Created_at - for chronological sorting

## 🔍 Full-Text Search

All content tables have a `search_vector` column using PostgreSQL's `tsvector` for fast full-text search.

**Example:**
```sql
SELECT * FROM info_amenities 
WHERE search_vector @@ plainto_tsquery('restaurant beach')
ORDER BY ts_rank(search_vector, plainto_tsquery('restaurant beach')) DESC;
```

## 🗺️ Geographic Features

Using PostGIS extension for location-based queries:

**Find nearby amenities:**
```sql
SELECT * FROM info_amenities
WHERE earth_distance(
  ll_to_earth(14.1067, 122.5631),
  ll_to_earth(latitude, longitude)
) / 1000 <= 5  -- Within 5km
ORDER BY earth_distance(...) ASC;
```

## 🛠️ Maintenance Tasks

### Automatic Cleanup (Run regularly)
```sql
-- Clean expired password reset tokens
SELECT cleanup_expired_reset_tokens();

-- Deactivate expired announcements
SELECT deactivate_expired_announcements();

-- Analyze table performance
ANALYZE;
```

### Manual Optimization
```sql
-- Vacuum to clean up dead rows
VACUUM ANALYZE info_amenities;

-- Reindex for performance
REINDEX INDEX idx_info_amenities_search_vector;
```

## 📝 API Integration

### In Your Next.js App

**Import utilities:**
```javascript
import { 
  getAmenities, 
  getEvents, 
  createBlog,
  uploadMedia 
} from '@/lib/supabaseUtils';
```

**Use in components:**
```javascript
const result = await getAmenities({ type: 'restaurant' });
if (result.success) {
  setAmenities(result.data);
} else {
  console.error(result.error);
}
```

## 🐛 Troubleshooting

### Issue: "No rows returned" with RLS
**Solution:** Check if RLS is blocking SELECT. Verify:
- Table has RLS enabled
- User has appropriate role
- Policy allows the operation

### Issue: Search not working
**Solution:** Verify search vectors are updated:
```sql
REINDEX INDEX idx_info_amenities_search_vector;
```

### Issue: Slow queries
**Solution:** Check query plan:
```sql
EXPLAIN ANALYZE SELECT * FROM info_amenities;
```

### Issue: File upload fails
**Solution:** Verify:
- Storage bucket exists and is public
- Upload policy allows authenticated users
- File size is under limit
- MIME type is allowed

## 📚 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Manual](https://www.postgresql.org/docs/)
- [PostGIS Documentation](https://postgis.net/docs/)
- [Full-Text Search Guide](https://www.postgresql.org/docs/current/textsearch.html)

## ✅ Checklist for Deployment

- [ ] All 3 migration files executed
- [ ] 6 storage buckets created
- [ ] Storage policies configured
- [ ] Environment variables set
- [ ] Sample data loaded (optional)
- [ ] Admin user created
- [ ] Connection tested
- [ ] RLS policies verified
- [ ] Backups enabled
- [ ] Monitoring configured

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Supabase Dashboard for error logs
3. Check PostgreSQL query plans with EXPLAIN
4. Review RLS policies for permission issues

---

**Version:** 1.0
**Last Updated:** June 13, 2026
**Status:** Production Ready
