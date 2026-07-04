# Complete Supabase Setup Guide for Connect-DAET

## Table of Contents
1. [Database Schema](#database-schema)
2. [Storage Buckets](#storage-buckets)
3. [Row Level Security](#row-level-security)
4. [Helper Functions](#helper-functions)
5. [Setup Instructions](#setup-instructions)
6. [Usage Examples](#usage-examples)

---

## Database Schema

### 1. **info_users** - User Management
Stores user accounts with authentication and profile information.

**Columns:**
- `id` (UUID): Primary key
- `email` (VARCHAR): Unique email address
- `password` (VARCHAR): Hashed password
- `full_name` (VARCHAR): User's full name
- `user_type` (VARCHAR): 'tourist', 'business', 'admin', 'moderator'
- `status` (VARCHAR): 'active', 'suspended', 'banned', 'pending'
- `profile_image_url` (TEXT): URL to profile image
- `phone_number` (VARCHAR): Contact number
- `bio` (TEXT): User biography
- `address` (VARCHAR): Physical address
- `last_login` (TIMESTAMP): Last login time
- `is_online` (BOOLEAN): Current online status
- `created_at`, `updated_at` (TIMESTAMP): Audit timestamps

**Indexes:**
- Email (for fast login lookup)
- User type (for filtering)
- Status (for user filtering)
- Search vector (for full-text search)

**Example Query:**
```sql
SELECT * FROM info_users 
WHERE user_type = 'admin' AND status = 'active'
ORDER BY created_at DESC;
```

---

### 2. **info_amenities** - Tourism Amenities
Stores amenities like hotels, restaurants, shops, services, facilities.

**Columns:**
- `id` (UUID): Primary key
- `name` (VARCHAR): Amenity name
- `type` (VARCHAR): 'accommodation', 'restaurant', 'transport', 'shop', 'service', 'facility'
- `description` (TEXT): Detailed description
- `location` (VARCHAR): Human-readable location
- `latitude`, `longitude` (NUMERIC): GPS coordinates
- `contact_number`, `email`, `website` (VARCHAR): Contact info
- `opening_hours` (VARCHAR): Business hours
- `price_range` (VARCHAR): Price category
- `amenities` (TEXT[]): Array of features (wifi, parking, etc.)
- `images` (TEXT[]): Array of image URLs
- `featured_image` (TEXT): Main image
- `rating` (NUMERIC): Average rating (0-5)
- `review_count` (INTEGER): Number of reviews
- `status` (VARCHAR): 'active', 'inactive', 'pending', 'archived'
- `featured` (BOOLEAN): Featured in listings
- `created_by` (UUID): Creator reference

**Indexes:**
- Type, status, featured (for filtering)
- Location (GiST index for nearby searches)
- Search vector (for full-text search)

**Example Query:**
```sql
-- Get nearby restaurants
SELECT * FROM info_amenities 
WHERE type = 'restaurant' AND status = 'active'
ORDER BY earth_distance(ll_to_earth(latitude, longitude), 
  ll_to_earth(14.1067, 122.5631)) / 1000 ASC
LIMIT 10;
```

---

### 3. **info_events** - Events Calendar
Stores events with scheduling and multimedia.

**Columns:**
- `id` (UUID): Primary key
- `title`, `description` (VARCHAR/TEXT): Event details
- `location`, `venue` (VARCHAR): Event location
- `latitude`, `longitude` (NUMERIC): GPS coordinates
- `start_date`, `end_date` (DATE): Event dates
- `start_time`, `end_time` (TIME): Event times
- `category` (VARCHAR): 'festival', 'concert', 'exhibition', 'workshop', 'sports', 'cultural'
- `organizer` (VARCHAR): Organizing entity
- `is_free` (BOOLEAN): Free or paid
- `ticket_price` (NUMERIC): Price (if not free)
- `max_attendees`, `current_attendees` (INTEGER): Capacity tracking
- `featured_image`, `images[]`, `videos[]` (TEXT): Media
- `status` (VARCHAR): 'draft', 'published', 'cancelled', 'completed'
- `published_at` (TIMESTAMP): Publication date
- `created_by` (UUID): Creator

**Example Query:**
```sql
-- Get upcoming published events
SELECT * FROM info_events 
WHERE status = 'published' 
  AND start_date >= CURRENT_DATE
ORDER BY start_date ASC
LIMIT 20;
```

---

### 4. **info_blogs** - Blog Posts
Stores blog content with categories and engagement metrics.

**Columns:**
- `id` (UUID): Primary key
- `title` (VARCHAR): Blog title
- `slug` (VARCHAR): URL-friendly slug (unique)
- `content` (TEXT): Full blog content (HTML/markdown)
- `excerpt` (TEXT): Short preview
- `featured_image` (TEXT): Blog header image
- `category` (VARCHAR): 'news', 'travel_tips', 'events', 'culture', 'food', 'announcement'
- `tags` (TEXT[]): Array of tags
- `status` (VARCHAR): 'draft', 'published', 'archived'
- `published_at` (TIMESTAMP): When published
- `views`, `likes`, `comments_count` (INTEGER): Engagement metrics
- `created_by` (UUID): Author

**Example Query:**
```sql
-- Get popular blog posts from this month
SELECT * FROM info_blogs 
WHERE status = 'published'
  AND published_at >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY views DESC, likes DESC
LIMIT 10;
```

---

### 5. **info_announcements** - Admin Announcements
Stores important announcements for users.

**Columns:**
- `id` (UUID): Primary key
- `title`, `content` (VARCHAR/TEXT): Announcement text
- `announcement_type` (VARCHAR): 'urgent', 'important', 'info', 'event', 'weather'
- `target_audience` (VARCHAR): 'all', 'tourists', 'businesses', 'admins'
- `priority` (INTEGER): Display priority (higher = more urgent)
- `featured_image` (TEXT): Icon/image
- `status` (VARCHAR): 'draft', 'published', 'archived'
- `published_at`, `expires_at` (TIMESTAMP): Time window
- `created_by` (UUID): Creator

**Example Query:**
```sql
-- Get active urgent announcements
SELECT * FROM info_announcements 
WHERE status = 'published'
  AND announcement_type = 'urgent'
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY priority DESC, published_at DESC;
```

---

### 6. **info_tourist_spots** - Tourist Destinations
Stores information about tourist attractions.

**Columns:**
- `id` (UUID): Primary key
- `name`, `description` (VARCHAR/TEXT): Spot details
- `category` (VARCHAR): 'beach', 'mountain', 'park', 'cultural', 'religious', 'historical', 'adventure'
- `location` (VARCHAR): Human-readable location
- `latitude`, `longitude` (NUMERIC): GPS coordinates
- `entry_fee` (NUMERIC): Admission cost
- `opening_hours`, `best_visit_time` (VARCHAR): Timing info
- `accessibility_info` (TEXT): Accessibility details
- `featured_image`, `images[]`, `videos[]` (TEXT): Media
- `rating` (NUMERIC): Average rating
- `review_count`, `visit_count` (INTEGER): Engagement
- `status` (VARCHAR): 'active', 'inactive', 'maintenance', 'closed'
- `featured` (BOOLEAN): Featured destination
- `created_by` (UUID): Creator

---

### 7. **info_moderation** - Moderation Reports
Stores user reports and moderation actions.

**Columns:**
- `id` (UUID): Primary key
- `report_type` (VARCHAR): 'user', 'content', 'amenity', 'event', 'blog', 'comment'
- `reported_item_id` (UUID): ID of reported content
- `reported_item_table` (VARCHAR): Table name of reported content
- `reason` (VARCHAR): Report reason
- `description` (TEXT): Detailed description
- `severity` (VARCHAR): 'low', 'medium', 'high', 'critical'
- `reported_by` (UUID): Reporter reference
- `reported_user_id` (UUID): Reported user (if applicable)
- `status` (VARCHAR): 'pending', 'reviewing', 'resolved', 'rejected'
- `assigned_to` (UUID): Assigned moderator
- `moderation_notes`, `resolution` (TEXT): Notes
- `resolved_at` (TIMESTAMP): Resolution time
- `attachments` (TEXT[]): Evidence files

---

### 8. **info_password_resets** - Password Reset Tokens
Stores temporary reset tokens.

**Columns:**
- `id` (UUID): Primary key
- `user_id` (UUID): User reference
- `token` (VARCHAR): Unique reset token
- `email` (VARCHAR): Email address
- `expires_at` (TIMESTAMP): Token expiry (1 hour)
- `used` (BOOLEAN): Already used?
- `used_at` (TIMESTAMP): When used
- `created_at` (TIMESTAMP): Created time

---

### 9. **info_comments** - Blog Comments
Stores comments on blog posts.

**Columns:**
- `id` (UUID): Primary key
- `blog_id` (UUID): Blog reference
- `user_id` (UUID): Commenter reference
- `content` (TEXT): Comment text
- `status` (VARCHAR): 'pending', 'approved', 'rejected'
- `likes` (INTEGER): Comment likes
- `created_at`, `updated_at` (TIMESTAMP): Audit fields

---

### 10. **info_audit_log** - Audit Trail
Logs all administrative actions.

**Columns:**
- `id` (UUID): Primary key
- `user_id` (UUID): Admin user
- `action` (VARCHAR): Action type ('INSERT', 'UPDATE', 'DELETE')
- `table_name` (VARCHAR): Affected table
- `record_id` (UUID): Affected record
- `changes` (JSONB): Before/after changes
- `ip_address` (INET): Client IP
- `user_agent` (TEXT): Browser info
- `created_at` (TIMESTAMP): Action timestamp

---

## Storage Buckets

Create these storage buckets in Supabase Dashboard:

### Bucket Configuration

1. **amenities** - Amenity photos
   - Public: Yes
   - File types: jpg, png, webp (max 10MB)

2. **events** - Event images and posters
   - Public: Yes
   - File types: jpg, png, webp, mp4 (max 50MB for videos)

3. **blogs** - Blog featured images
   - Public: Yes
   - File types: jpg, png, webp (max 10MB)

4. **tourist-spots** - Attraction photos
   - Public: Yes
   - File types: jpg, png, webp, mp4 (max 50MB)

5. **user-profiles** - User profile images
   - Public: Yes
   - File types: jpg, png, webp (max 5MB)

6. **announcements** - Announcement graphics
   - Public: Yes
   - File types: jpg, png, webp, svg (max 5MB)

### Storage Policies

```sql
-- Allow public read access
CREATE POLICY "Public Read Access" ON storage.objects
  FOR SELECT USING (bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'announcements'));

-- Allow authenticated users to upload
CREATE POLICY "Authenticated Upload" ON storage.objects
  FOR INSERT 
  WITH CHECK (
    auth.role() = 'authenticated' 
    AND bucket_id IN ('amenities', 'events', 'blogs', 'tourist-spots', 'user-profiles', 'announcements')
  );

-- Allow deletion by uploader
CREATE POLICY "Owner Delete" ON storage.objects
  FOR DELETE USING (auth.uid()::text = owner);
```

---

## Row Level Security (RLS)

RLS ensures users can only access data they're authorized to see.

### Policy Hierarchy

1. **Public Access**: Anyone can view published content
2. **Authenticated Access**: Logged-in users can create content
3. **Owner Access**: Users can modify their own content
4. **Admin Access**: Admins can modify any content
5. **Moderator Access**: Moderators can review and moderate content

### User-Specific Policies

```sql
-- Users can see their own profile
CREATE POLICY "users_select" ON public.info_users
  FOR SELECT
  USING (auth.uid()::text = id::text OR is_admin(auth.uid()));

-- Users can update only their profile
CREATE POLICY "users_update_own" ON public.info_users
  FOR UPDATE
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);
```

### Content-Specific Policies

```sql
-- Everyone can view published content
CREATE POLICY "amenities_select_public" ON public.info_amenities
  FOR SELECT
  USING (status = 'active' OR created_by = auth.uid() OR is_admin(auth.uid()));

-- Only creators and admins can update
CREATE POLICY "amenities_update" ON public.info_amenities
  FOR UPDATE
  USING (is_admin(auth.uid()) OR created_by = auth.uid())
  WITH CHECK (is_admin(auth.uid()) OR created_by = auth.uid());
```

---

## Helper Functions

Pre-built PostgreSQL functions for common operations:

### User Functions
- `is_admin(user_id)` - Check if user is admin
- `is_moderator(user_id)` - Check if user is moderator
- `get_user_statistics()` - User stats for dashboard

### Search Functions
- `search_content(query)` - Full-text search across all content
- `get_amenities_by_category(category)` - Filter amenities
- `get_nearby_amenities(lat, lon, distance)` - Geo search
- `get_upcoming_events(limit)` - Next events

### Auth Functions
- `generate_password_reset_token(user_id)` - Create reset token
- `verify_and_use_reset_token(token)` - Validate and consume token

### Analytics Functions
- `get_user_statistics()` - User count and status
- `get_content_statistics()` - Content count by type
- `deactivate_expired_announcements()` - Auto-archive old announcements
- `cleanup_expired_reset_tokens()` - Auto-cleanup old tokens

### Audit Functions
- `log_audit_action(user_id, action, table_name, record_id, changes)` - Log changes

---

## Setup Instructions

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note the Project URL and API keys

### Step 2: Configure Environment Variables
Update `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Step 3: Run Database Migrations
In Supabase Dashboard → SQL Editor, run migrations in order:

1. **001_init_schema.sql** - Create all tables and indexes
2. **002_rls_policies.sql** - Enable RLS and create policies
3. **003_functions_and_helpers.sql** - Create helper functions

### Step 4: Create Storage Buckets
In Supabase Dashboard → Storage:
1. Create each bucket (amenities, events, blogs, etc.)
2. Make them public
3. Set up policies (shown above)

### Step 5: Test Connection
```javascript
import { supabase } from '@/lib/supabaseClient';

const { data, error } = await supabase.from('info_users').select('COUNT(*)');
console.log('Connected!', data);
```

---

## Usage Examples

### Authentication

```javascript
import { loginUser, registerUser } from '@/lib/supabaseUtils';

// Register
const result = await registerUser({
  email: 'user@example.com',
  password: 'SecurePass123!',
  full_name: 'John Doe',
  user_type: 'tourist'
});

// Login
const loginResult = await loginUser('user@example.com', 'SecurePass123!');
sessionStorage.setItem('user_session', JSON.stringify(loginResult.user));
```

### Fetch Amenities

```javascript
import { getAmenities, getTouristSpots } from '@/lib/supabaseUtils';

// Get all active restaurants
const result = await getAmenities({ type: 'restaurant' });

// Get nearby amenities
const nearby = await getNearbyAmenities(14.1067, 122.5631, 5); // 5km radius
```

### Manage Events

```javascript
import { getEvents, createEvent, updateEvent } from '@/lib/supabaseUtils';

// Get upcoming events
const events = await getEvents({ upcoming: true });

// Create event
const newEvent = await createEvent({
  title: 'Daet Tourism Festival',
  category: 'festival',
  location: 'Bagasbas Beach',
  start_date: '2025-01-15',
  end_date: '2025-01-17',
  status: 'published'
}, userId);

// Update event
await updateEvent(eventId, { status: 'completed' });
```

### Blog Operations

```javascript
import { getBlogs, getBlogBySlug, likeBlog, createComment } from '@/lib/supabaseUtils';

// Get published blogs
const blogs = await getBlogs({ category: 'travel_tips' });

// Get specific blog
const blog = await getBlogBySlug('my-travel-guide');

// Like blog
await likeBlog(blogId);

// Add comment
await createComment(blogId, userId, 'Great post!');
```

### Search

```javascript
import { searchContent } from '@/lib/supabaseUtils';

// Search across all content
const results = await searchContent('beaches daet');
// Returns: amenities, events, blogs, tourist spots matching query
```

### File Upload

```javascript
import { uploadMedia } from '@/lib/supabaseUtils';

// Upload amenity photo
const file = event.target.files[0];
const result = await uploadMedia('amenities', file, 'restaurants');
// Returns: { success: true, url: 'https://...' }

const amenityData = {
  ...form,
  featured_image: result.url
};
```

### Admin Operations

```javascript
import { createAnnouncement, getUserStatistics } from '@/lib/supabaseUtils';

// Create announcement
await createAnnouncement({
  title: 'Beach Closure',
  content: 'Bagasbas Beach is closed for maintenance',
  announcement_type: 'urgent',
  target_audience: 'all',
  priority: 10,
  expires_at: new Date(Date.now() + 24*60*60*1000).toISOString()
}, adminId);

// Get user stats
const stats = await getUserStatistics();
console.log(`${stats.total_users} total users, ${stats.online_users} online`);
```

---

## API Response Format

All functions return standardized responses:

```javascript
{
  success: boolean,
  data?: any,        // Returned data if successful
  error?: string     // Error message if failed
}
```

Example:
```javascript
const result = await getAmenities();
if (result.success) {
  console.log(result.data); // Array of amenities
} else {
  console.error(result.error); // Error message
}
```

---

## Monitoring & Maintenance

### Monitor Performance
- Check slow queries in Supabase Dashboard → Database → Query Analysis
- Review indexes in Database → Schema → Indexes
- Monitor storage usage in Database → Storage

### Regular Cleanup Tasks

Schedule these periodic tasks:

```sql
-- Daily: Clean up expired password reset tokens
SELECT cleanup_expired_reset_tokens();

-- Daily: Deactivate expired announcements
SELECT deactivate_expired_announcements();

-- Weekly: Analyze query performance
ANALYZE;
```

---

## Security Best Practices

1. **Never expose service_role_key** in frontend code
2. **Use RLS policies** to enforce data access
3. **Validate inputs** before database queries
4. **Hash passwords** before storing
5. **Use HTTPS** for all API calls
6. **Rotate keys** regularly
7. **Monitor audit logs** for suspicious activity
8. **Enable 2FA** for admin accounts

---

## Troubleshooting

### RLS Blocking All Queries
- Verify table has RLS enabled
- Check if authenticated user exists in session
- Ensure policy allows the operation

### Slow Queries
- Add indexes on frequently filtered columns
- Use LIMIT in SELECT queries
- Avoid complex JOINs
- Check query analysis in dashboard

### Storage Upload Fails
- Verify bucket is public
- Check storage policies allow upload
- Ensure file size is under bucket limit
- Verify MIME type is allowed

---

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Full-Text Search](https://www.postgresql.org/docs/current/textsearch.html)
- [PostGIS for Geographic Queries](https://postgis.net/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Created:** June 2025
**Last Updated:** June 13, 2026
**Version:** 1.0
