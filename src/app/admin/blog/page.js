// app/admin/blog/page.js
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import { Icon } from '@/app/components/Icon';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import MediaUpload from '@/app/components/MediaUpload';
import { trackUserActivity } from '@/lib/trackActivity';

const BLOG_CATEGORIES = [
  { value: 'news', label: 'News', color: 'bg-blue-100 text-blue-700' },
  { value: 'travel_tips', label: 'Travel Tips', color: 'bg-green-100 text-green-700' },
  { value: 'events', label: 'Events', color: 'bg-purple-100 text-purple-700' },
  { value: 'culture', label: 'Culture', color: 'bg-orange-100 text-orange-700' },
  { value: 'food', label: 'Food', color: 'bg-red-100 text-red-700' },
  { value: 'announcement', label: 'Announcement', color: 'bg-yellow-100 text-yellow-700' },
];

const BLOG_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY_FORM = {
  title: '',
  slug: '',
  content: '',
  excerpt: '',
  featured_image: '',
  category: '',
  tags: '',
  status: 'draft',
  scheduled_for: '',
  meta_title: '',
  meta_description: '',
  featured_post: false,
};

export default function BlogManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blogs, setBlogs] = useState([]);
  const [selectedBlogs, setSelectedBlogs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBlog, setEditingBlog] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [commentQueue, setCommentQueue] = useState([]);
  const [categoryOptions, setCategoryOptions] = useState(BLOG_CATEGORIES);
  const [newCategoryValue, setNewCategoryValue] = useState('');
  const [featuredIds, setFeaturedIds] = useState({});

  const [blogForm, setBlogForm] = useState(EMPTY_FORM);

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const fetchBlogs = async () => {
    try {
      const { data, error } = await supabase
        .from('info_blogs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBlogs(data || []);

      const { data: comments, error: commentsError } = await supabase
        .from('info_comments')
        .select('*')
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;
      setCommentQueue(comments || []);
    } catch (err) {
      console.error('Error fetching blogs:', err);
      showToast('Failed to load blog data', true);
    }
  };

  const updateCommentStatus = async (commentId, status) => {
    try {
      const { error } = await supabase
        .from('info_comments')
        .update({ status })
        .eq('id', commentId);

      if (error) throw error;
      showToast(`Comment ${status}.`);
      await fetchBlogs();
    } catch (err) {
      console.error('Error updating comment:', err);
      showToast('Unable to update comment status', true);
    }
  };

  const toggleFeatured = (blogId) => {
    setFeaturedIds((prev) => ({
      ...prev,
      [blogId]: !prev[blogId],
    }));
  };

  const saveBlog = async () => {
    if (!blogForm.title.trim() || !blogForm.content.trim() || !blogForm.category) {
      showToast('Please complete the required fields', true);
      return;
    }

    setSaving(true);
    try {
      const slug = (blogForm.slug || generateSlug(blogForm.title)).trim();
      const tagsArray = blogForm.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const publishedAt = blogForm.status === 'published'
        ? (blogForm.scheduled_for ? new Date(blogForm.scheduled_for).toISOString() : new Date().toISOString())
        : null;

      const blogData = {
        title: blogForm.title.trim(),
        slug,
        content: blogForm.content,
        excerpt: blogForm.excerpt || blogForm.content.substring(0, 160),
        featured_image: blogForm.featured_image || null,
        category: blogForm.category,
        tags: tagsArray,
        status: blogForm.status,
        published_at: publishedAt,
      };

      let result;
      let savedBlogId = editingBlog?.id || null;
      if (editingBlog) {
        result = await supabase
          .from('info_blogs')
          .update(blogData)
          .eq('id', editingBlog.id);
      } else {
        result = await supabase
          .from('info_blogs')
          .insert([{ ...blogData, created_by: user?.id }])
          .select('id');
        savedBlogId = result.data?.[0]?.id || null;
      }

      if (result.error) throw result.error;

      if (!editingBlog && savedBlogId && user?.id) {
        trackUserActivity({
          userId: user.id,
          activityType: 'new_post',
          entityType: 'blog',
          entityId: savedBlogId,
          description: `Published a new blog post: ${blogForm.title.trim()}`,
          metadata: {
            contentTitle: blogForm.title.trim(),
            ownerUserId: user.id,
          },
        });
      }

      showToast(editingBlog ? 'Blog updated successfully.' : 'Blog published successfully.');
      await fetchBlogs();
      closeModal();
    } catch (err) {
      console.error('Error saving blog:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const softDeleteBlog = async (blog) => {
    if (!confirm(`Archive "${blog.title}"?`)) return;

    try {
      const { error } = await supabase
        .from('info_blogs')
        .update({ status: 'archived' })
        .eq('id', blog.id);

      if (error) throw error;
      showToast('Blog archived.');
      await fetchBlogs();
    } catch (err) {
      console.error('Error archiving blog:', err);
      showToast('Failed to archive blog', true);
    }
  };

  const bulkUpdateStatus = async (status) => {
    if (!selectedBlogs.length) return;

    try {
      const requests = selectedBlogs.map((id) =>
        supabase.from('info_blogs').update({ status }).eq('id', id)
      );

      await Promise.all(requests);
      setSelectedBlogs([]);
      showToast(`Updated ${selectedBlogs.length} posts.`);
      await fetchBlogs();
    } catch (err) {
      console.error('Bulk status update failed:', err);
      showToast('Bulk update failed', true);
    }
  };

  const bulkDelete = async () => {
    if (!selectedBlogs.length) return;

    try {
      const requests = selectedBlogs.map((id) =>
        supabase.from('info_blogs').update({ status: 'archived' }).eq('id', id)
      );

      await Promise.all(requests);
      setSelectedBlogs([]);
      showToast(`Archived ${selectedBlogs.length} posts.`);
      await fetchBlogs();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      showToast('Bulk archive failed', true);
    }
  };

  const openCreateModal = () => {
    setEditingBlog(null);
    setBlogForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (blog) => {
    setEditingBlog(blog);
    setBlogForm({
      title: blog.title || '',
      slug: blog.slug || '',
      content: blog.content || '',
      excerpt: blog.excerpt || '',
      featured_image: blog.featured_image || '',
      category: blog.category || '',
      tags: Array.isArray(blog.tags) ? blog.tags.join(', ') : '',
      status: blog.status || 'draft',
      scheduled_for: blog.published_at ? new Date(blog.published_at).toISOString().slice(0, 16) : '',
      meta_title: '',
      meta_description: '',
      featured_post: Boolean(featuredIds[blog.id]),
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBlog(null);
    setBlogForm(EMPTY_FORM);
  };

  const addCategory = () => {
    const value = newCategoryValue.trim();
    if (!value) return;
    const newEntry = {
      value: value.toLowerCase().replace(/\s+/g, '_'),
      label: value,
      color: 'bg-gray-100 text-gray-700',
    };
    setCategoryOptions((prev) => [...prev, newEntry]);
    setNewCategoryValue('');
  };

  const getCategoryDisplay = (category) => {
    const found = categoryOptions.find((item) => item.value === category) || BLOG_CATEGORIES.find((item) => item.value === category);
    return found || { label: category || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      published: 'bg-green-100 text-green-700',
      draft: 'bg-yellow-100 text-yellow-700',
      archived: 'bg-gray-100 text-gray-700',
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  const stats = useMemo(() => {
    return {
      total: blogs.length,
      published: blogs.filter((blog) => blog.status === 'published').length,
      draft: blogs.filter((blog) => blog.status === 'draft').length,
      archived: blogs.filter((blog) => blog.status === 'archived').length,
      comments: commentQueue.length,
      views: blogs.reduce((sum, blog) => sum + Number(blog.views || 0), 0),
    };
  }, [blogs, commentQueue]);

  const filteredBlogs = useMemo(() => {
    return blogs.filter((blog) => {
      const matchesSearch = blog.title?.toLowerCase().includes(searchTerm.toLowerCase()) ?? true;
      const matchesCategory = categoryFilter === 'all' || blog.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || blog.status === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [blogs, categoryFilter, searchTerm, statusFilter]);

  useEffect(() => {
    const checkAuth = async () => {
      const session = getStoredSession();
      if (!session) {
        router.push('/login');
        return;
      }

      try {
        const userData = JSON.parse(session);
        if (!hasAdminAccess(userData.role)) {
          router.push('/dashboard');
          return;
        }

        setUser(userData);
        await fetchBlogs();
      } catch (err) {
        console.error('Auth check failed:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminSidebar user={user} roleLabel="Admin Console" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Blog Management</h1>
            <p className="text-gray-500 mt-1">Create, edit, schedule, and moderate tourism content.</p>
          </div>
          <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <span>+</span> Write New Post
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">{stats.total}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Published</p>
            <p className="mt-2 text-2xl font-bold text-green-600">{stats.published}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Drafts</p>
            <p className="mt-2 text-2xl font-bold text-yellow-600">{stats.draft}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Comments</p>
            <p className="mt-2 text-2xl font-bold text-purple-600">{stats.comments}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Views</p>
            <p className="mt-2 text-2xl font-bold text-gray-800">{stats.views}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search posts..."
                className="min-w-[220px] px-4 py-2 border border-gray-200 rounded-2xl"
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
                <option value="all">All categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
                <option value="all">All statuses</option>
                {BLOG_STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => bulkUpdateStatus('published')} className="rounded-full bg-green-50 px-3 py-2 text-sm text-green-700 hover:bg-green-100">Publish selected</button>
              <button onClick={() => bulkUpdateStatus('draft')} className="rounded-full bg-yellow-50 px-3 py-2 text-sm text-yellow-700 hover:bg-yellow-100">Draft selected</button>
              <button onClick={bulkDelete} className="rounded-full bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100">Archive selected</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
          <div className="space-y-4">
            {filteredBlogs.map((blog) => {
              const category = getCategoryDisplay(blog.category);
              const isFeatured = Boolean(featuredIds[blog.id]);
              const isChecked = selectedBlogs.includes(blog.id);

              return (
                <div key={blog.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex gap-4">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => setSelectedBlogs((prev) => prev.includes(blog.id) ? prev.filter((id) => id !== blog.id) : [...prev, blog.id])}
                      className="mt-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />

                    {blog.featured_image && (
                      <img src={blog.featured_image} alt={blog.title} className="h-24 w-32 rounded-2xl object-cover" />
                    )}

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${category.color}`}>{category.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(blog.status)}`}>{blog.status}</span>
                        {isFeatured && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Featured</span>}
                        {blog.views > 0 && <span className="text-xs text-gray-400">Views: {blog.views}</span>}
                        {blog.likes > 0 && <span className="text-xs text-gray-400">Likes: {blog.likes}</span>}
                      </div>

                      <h3 className="font-bold text-gray-800 text-lg">{blog.title}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">{blog.excerpt || blog.content.substring(0, 120)}</p>

                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                        <span>Created: {new Date(blog.created_at).toLocaleDateString()}</span>
                        {blog.published_at && <span>Published: {new Date(blog.published_at).toLocaleDateString()}</span>}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={() => toggleFeatured(blog.id)} className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-xl text-sm hover:bg-purple-100">
                          {isFeatured ? 'Unfeature' : 'Feature'}
                        </button>
                        <button onClick={() => openEditModal(blog)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-sm hover:bg-blue-100">Edit</button>
                        <button onClick={() => softDeleteBlog(blog)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-sm hover:bg-red-100">Archive</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-lg font-bold text-gray-800 mb-3">Blog Categories</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {categoryOptions.map((cat) => (
                  <span key={cat.value} className={`rounded-full px-2 py-1 text-xs font-medium ${cat.color}`}>{cat.label}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryValue}
                  onChange={(e) => setNewCategoryValue(e.target.value)}
                  placeholder="Add new category"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl"
                />
                <button onClick={addCategory} className="bg-gray-800 text-white px-3 py-2 rounded-xl">Add</button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-lg font-bold text-gray-800 mb-3">Comment Moderation</h3>
              <div className="space-y-3">
                {commentQueue.length === 0 ? (
                  <p className="text-sm text-gray-500">No comments yet.</p>
                ) : (
                  commentQueue.slice(0, 5).map((comment) => (
                    <div key={comment.id} className="rounded-xl border border-gray-200 p-3">
                      <p className="text-sm text-gray-600">{comment.content}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-gray-400">{comment.status}</span>
                        <div className="flex gap-2">
                          <button onClick={() => updateCommentStatus(comment.id, 'approved')} className="text-xs text-green-700 bg-green-50 px-2 py-1 rounded">Approve</button>
                          <button onClick={() => updateCommentStatus(comment.id, 'rejected')} className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded">Reject</button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{editingBlog ? 'Edit Blog' : 'New Blog'}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={blogForm.title}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, title: e.target.value, slug: e.target.value ? generateSlug(e.target.value) : '' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Enter blog title"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input
                    type="text"
                    value={blogForm.slug}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, slug: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    value={blogForm.category}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  >
                    <option value="">Select category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={blogForm.status} onChange={(e) => setBlogForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                    {BLOG_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled publish</label>
                  <input
                    type="datetime-local"
                    value={blogForm.scheduled_for}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, scheduled_for: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Meta title</label>
                  <input
                    type="text"
                    value={blogForm.meta_title}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, meta_title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                    placeholder="SEO title"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                  <input
                    type="text"
                    value={blogForm.tags}
                    onChange={(e) => setBlogForm((prev) => ({ ...prev, tags: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                    placeholder="beach, culture, travel"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meta description</label>
                <textarea
                  value={blogForm.meta_description}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, meta_description: e.target.value }))}
                  rows="2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Short search description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Image</label>
                <MediaUpload
                  bucket="blogs"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={blogForm.featured_image}
                  onUploadComplete={(url) => setBlogForm((prev) => ({ ...prev, featured_image: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="Upload image"
                  maxSizeMB={5}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={blogForm.featured_post}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, featured_post: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <label className="text-sm text-gray-700">Mark as featured post</label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
                <textarea
                  value={blogForm.excerpt}
                  rows="2"
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl"
                  placeholder="Short summary for listing cards"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
                <textarea
                  value={blogForm.content}
                  onChange={(e) => setBlogForm((prev) => ({ ...prev, content: e.target.value }))}
                  rows="10"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-sm"
                  placeholder="Write the article..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveBlog} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-60">
                {saving ? 'Saving...' : editingBlog ? 'Update Blog' : 'Publish Blog'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          <span className="inline-block mr-2">{toastMessage.isError ? <Icon name="warning" className="w-4 h-4" /> : <Icon name="check" className="w-4 h-4" />}</span>
          {toastMessage.message}
        </div>
      )}
    </div>
  );
}
