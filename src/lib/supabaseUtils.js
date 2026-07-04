// lib/supabaseUtils.js
import { supabase } from './supabase';

/**
 * ============================================================================
 * USER MANAGEMENT
 * ============================================================================
 */

export async function registerUser(userData) {
  try {
    const { data, error } = await supabase
      .from('info_users')
      .insert([{
        email: userData.email,
        password: userData.password,
        full_name: userData.full_name,
        user_type: userData.user_type || 'tourist',
        status: 'active'
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function loginUser(email, password) {
  try {
    const { data: user, error } = await supabase
      .from('info_users')
      .select('id, email, full_name, password, user_type, status')
      .eq('email', email)
      .single();

    if (error) throw error;
    if (user.status !== 'active') {
      throw new Error(`Account is ${user.status}`);
    }
    if (user.password !== password) {
      throw new Error('Invalid credentials');
    }

    await updateUserLastLogin(user.id);
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getUserById(userId) {
  try {
    const { data, error } = await supabase
      .from('info_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateUserProfile(userId, updates) {
  try {
    const { data, error } = await supabase
      .from('info_users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateUserLastLogin(userId) {
  return supabase
    .from('info_users')
    .update({
      last_login: new Date().toISOString(),
      is_online: true
    })
    .eq('id', userId);
}

export async function setUserOffline(userId) {
  return supabase
    .from('info_users')
    .update({ is_online: false })
    .eq('id', userId);
}

export async function searchUsers(query) {
  try {
    const { data, error } = await supabase
      .from('info_users')
      .select('id, email, full_name, user_type, profile_image_url')
      .ilike('full_name', `%${query}%`)
      .limit(10);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * PASSWORD RESET
 * ============================================================================
 */

export async function requestPasswordReset(email) {
  try {
    const { data: user, error: userError } = await supabase
      .from('info_users')
      .select('id, email')
      .eq('email', email)
      .single();

    if (userError) throw new Error('User not found');

    const { data, error } = await supabase
      .rpc('generate_password_reset_token', { p_user_id: user.id });

    if (error) throw error;
    return { success: true, resetId: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function verifyResetToken(token) {
  try {
    const { data, error } = await supabase
      .rpc('verify_and_use_reset_token', { p_token: token });

    if (error) throw error;
    if (!data.valid) throw new Error('Invalid or expired token');

    return { success: true, userId: data.user_id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function resetPassword(userId, newPassword) {
  try {
    const { data, error } = await supabase
      .from('info_users')
      .update({ password: newPassword })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * AMENITIES
 * ============================================================================
 */

export async function getAmenities(filters = {}) {
  try {
    let query = supabase
      .from('info_amenities')
      .select('*')
      .eq('status', 'active');

    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }
    if (filters.featured) {
      query = query.eq('featured', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getAmenityById(id) {
  try {
    const { data, error } = await supabase
      .from('info_amenities')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function createAmenity(amenityData, userId) {
  try {
    const { data, error } = await supabase
      .from('info_amenities')
      .insert([{
        ...amenityData,
        created_by: userId
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateAmenity(id, updates) {
  try {
    const { data, error } = await supabase
      .from('info_amenities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteAmenity(id) {
  try {
    const { error } = await supabase
      .from('info_amenities')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * EVENTS
 * ============================================================================
 */

export async function getEvents(filters = {}) {
  try {
    let query = supabase
      .from('info_events')
      .select('*')
      .eq('status', 'published');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }
    if (filters.upcoming) {
      query = query.gte('start_date', new Date().toISOString().split('T')[0]);
    }

    const { data, error } = await query
      .order('start_date', { ascending: true })
      .limit(50);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getEventById(id) {
  try {
    const { data, error } = await supabase
      .from('info_events')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function createEvent(eventData, userId) {
  try {
    const { data, error } = await supabase
      .from('info_events')
      .insert([{
        ...eventData,
        created_by: userId,
        published_at: eventData.status === 'published' ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateEvent(id, updates) {
  try {
    const { data, error } = await supabase
      .from('info_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteEvent(id) {
  try {
    const { error } = await supabase
      .from('info_events')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * BLOGS
 * ============================================================================
 */

export async function getBlogs(filters = {}) {
  try {
    let query = supabase
      .from('info_blogs')
      .select('id, title, slug, excerpt, featured_image, category, created_at, published_at, views, likes')
      .eq('status', 'published');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query
      .order('published_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getBlogBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('info_blogs')
      .select(`
        *,
        created_by:info_users(full_name, profile_image_url),
        comments:info_comments(count)
      `)
      .eq('slug', slug)
      .eq('status', 'published')
      .single();

    if (error) throw error;

    // Increment views
    if (data) {
      await supabase
        .from('info_blogs')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', data.id);
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function createBlog(blogData, userId) {
  try {
    const { data, error } = await supabase
      .from('info_blogs')
      .insert([{
        ...blogData,
        created_by: userId,
        published_at: blogData.status === 'published' ? new Date().toISOString() : null
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateBlog(id, updates) {
  try {
    const { data, error } = await supabase
      .from('info_blogs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function likeBlog(blogId) {
  try {
    const { data: blog, error: fetchError } = await supabase
      .from('info_blogs')
      .select('likes')
      .eq('id', blogId)
      .single();

    if (fetchError) throw fetchError;

    const { data, error } = await supabase
      .from('info_blogs')
      .update({ likes: (blog.likes || 0) + 1 })
      .eq('id', blogId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * BLOG COMMENTS
 * ============================================================================
 */

export async function getComments(blogId) {
  try {
    const { data, error } = await supabase
      .from('info_comments')
      .select('*, user:info_users(full_name, profile_image_url)')
      .eq('blog_id', blogId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function createComment(blogId, userId, content) {
  try {
    const { data, error } = await supabase
      .from('info_comments')
      .insert([{
        blog_id: blogId,
        user_id: userId,
        content,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * ANNOUNCEMENTS
 * ============================================================================
 */

export async function getAnnouncements() {
  try {
    const { data, error } = await supabase
      .from('info_announcements')
      .select('*')
      .eq('status', 'published')
      .gt('expires_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('published_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function createAnnouncement(announcementData, userId) {
  try {
    const { data, error } = await supabase
      .from('info_announcements')
      .insert([{
        ...announcementData,
        created_by: userId
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * TOURIST SPOTS
 * ============================================================================
 */

export async function getTouristSpots(filters = {}) {
  try {
    let query = supabase
      .from('info_tourist_spots')
      .select('*')
      .eq('status', 'active');

    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.featured) {
      query = query.eq('featured', true);
    }
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error } = await query
      .order('rating', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getTouristSpotById(id) {
  try {
    const { data, error } = await supabase
      .from('info_tourist_spots')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * SEARCH
 * ============================================================================
 */

export async function searchContent(query) {
  try {
    const { data, error } = await supabase
      .rpc('search_content', { p_query: query });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * MEDIA UPLOAD
 * ============================================================================
 */

export async function uploadMedia(bucket, file, folder = '') {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: '3600'
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return { success: true, url: publicUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function deleteMedia(bucket, filePath) {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * MODERATION
 * ============================================================================
 */

export async function createReport(reportData, userId) {
  try {
    const { data, error } = await supabase
      .from('info_moderation')
      .insert([{
        ...reportData,
        reported_by: userId
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================================================
 * STATISTICS
 * ============================================================================
 */

export async function getUserStatistics() {
  try {
    const { data, error } = await supabase
      .rpc('get_user_statistics');

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getContentStatistics() {
  try {
    const { data, error } = await supabase
      .rpc('get_content_statistics');

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  // Users
  registerUser,
  loginUser,
  getUserById,
  updateUserProfile,
  searchUsers,
  
  // Auth
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  
  // Amenities
  getAmenities,
  getAmenityById,
  createAmenity,
  updateAmenity,
  deleteAmenity,
  
  // Events
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  
  // Blogs
  getBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  likeBlog,
  getComments,
  createComment,
  
  // Announcements
  getAnnouncements,
  createAnnouncement,
  
  // Tourist Spots
  getTouristSpots,
  getTouristSpotById,
  
  // Search & Media
  searchContent,
  uploadMedia,
  deleteMedia,
  
  // Moderation
  createReport,
  
  // Stats
  getUserStatistics,
  getContentStatistics
};
