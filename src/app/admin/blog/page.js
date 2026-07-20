// app/admin/blog/page.js
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/app/components/AdminSidebar';
import MediaUpload from '@/app/components/MediaUpload';

const BLOG_CATEGORIES = [
  { value: 'news', label: '📰 News', color: 'bg-blue-100 text-blue-700' },
  { value: 'travel_tips', label: '💡 Travel Tips', color: 'bg-green-100 text-green-700' },
  { value: 'events', label: '🎉 Events', color: 'bg-purple-100 text-purple-700' },
  { value: 'culture', label: '🎭 Culture', color: 'bg-orange-100 text-orange-700' },
  { value: 'food', label: '🍜 Food', color: 'bg-red-100 text-red-700' },
  { value: 'announcement', label: '📢 Announcement', color: 'bg-yellow-100 text-yellow-700' },
];

export default function BlogManagement() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blogs, setBlogs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBlog, setEditingBlog] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [blogForm, setBlogForm] = useState({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    featured_image: '',
    category: '',
    tags: '',
    status: 'draft'
  });

  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const showToast = (message, isError = false) => {
    setToastMessage({ message, isError });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchBlogs = async () => {
    try {
      const { data, error } = await supabase
        .from('info_blogs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBlogs(data || []);
    } catch (err) {
      console.error('Error fetching blogs:', err);
      showToast('Failed to load blogs', true);
    }
  };

  const saveBlog = async () => {
    if (!blogForm.title.trim() || !blogForm.content.trim() || !blogForm.category) {
      showToast('Please fill in all required fields', true);
      return;
    }

    setSaving(true);
    try {
      const slug = blogForm.slug || generateSlug(blogForm.title);
      const tagsArray = blogForm.tags.split(',').map(t => t.trim()).filter(t => t);

      const blogData = {
        title: blogForm.title,
        slug: slug,
        content: blogForm.content,
        excerpt: blogForm.excerpt || blogForm.content.substring(0, 160),
        featured_image: blogForm.featured_image || null,
        category: blogForm.category,
        tags: tagsArray,
        status: blogForm.status,
        author_id: user?.id,
        published_at: blogForm.status === 'published' ? new Date().toISOString() : null
      };

      let result;
      if (editingBlog) {
        result = await supabase
          .from('info_blogs')
          .update(blogData)
          .eq('id', editingBlog.id);
      } else {
        result = await supabase
          .from('info_blogs')
          .insert([blogData]);
      }

      if (result.error) throw result.error;

      showToast(editingBlog ? 'Blog updated!' : 'Blog published!');
      fetchBlogs();
      closeModal();
    } catch (err) {
      console.error('Error saving blog:', err);
      showToast(`Failed to save: ${err.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const deleteBlog = async (blog) => {
    if (!confirm(`Delete "${blog.title}" permanently?`)) return;

    try {
      const { error } = await supabase
        .from('info_blogs')
        .delete()
        .eq('id', blog.id);

      if (error) throw error;
      showToast(`"${blog.title}" deleted`);
      fetchBlogs();
    } catch (err) {
      console.error('Error deleting blog:', err);
      showToast('Failed to delete blog', true);
    }
  };

  const openCreateModal = () => {
    setEditingBlog(null);
    setBlogForm({
      title: '',
      slug: '',
      content: '',
      excerpt: '',
      featured_image: '',
      category: '',
      tags: '',
      status: 'draft'
    });
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
      tags: blog.tags ? blog.tags.join(', ') : '',
      status: blog.status || 'draft'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBlog(null);
  };

  const getCategoryDisplay = (category) => {
    const found = BLOG_CATEGORIES.find(c => c.value === category);
    return found || { label: category || 'General', color: 'bg-gray-100 text-gray-700' };
  };

  const getStatusBadge = (status) => {
    const badges = {
      'published': 'bg-green-100 text-green-700',
      'draft': 'bg-yellow-100 text-yellow-700',
      'archived': 'bg-gray-100 text-gray-700'
    };
    return badges[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredBlogs = blogs.filter(blog => {
    const matchesSearch = blog.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || blog.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || blog.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  useEffect(() => {
    const checkAuth = async () => {
      const session = sessionStorage.getItem('user_session');
      if (!session) {
        router.push('/login');
        return;
      }
      const userData = JSON.parse(session);
      if (userData.role !== 'admin') {
        router.push('/dashboard');
        return;
      }
      setUser(userData);
      await fetchBlogs();
      setLoading(false);
    };
    checkAuth();
  }, []);

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

      {/* Main Content */}
      <div className="ml-64 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">📝 Blog & News Management</h1>
            <p className="text-gray-500 mt-1">Create and manage tourism articles, news, and travel guides</p>
          </div>
          <button onClick={openCreateModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <span>+</span> Write New Post
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input type="text" placeholder="🔍 Search posts..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-4 py-2 border border-gray-200 rounded-2xl" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Categories</option>
              {BLOG_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-2xl">
              <option value="all">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <div className="text-sm text-gray-500">{filteredBlogs.length} posts</div>
          </div>
        </div>

        {/* Blog List */}
        <div className="space-y-4">
          {filteredBlogs.map((blog) => {
            const category = getCategoryDisplay(blog.category);
            return (
              <div key={blog.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex gap-4">
                  {blog.featured_image && (
                    <img src={blog.featured_image} alt={blog.title} className="w-32 h-32 object-cover rounded-2xl" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${category.color}`}>
                        {category.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadge(blog.status)}`}>
                        {blog.status}
                      </span>
                      {blog.views > 0 && <span className="text-xs text-gray-400">👁️ {blog.views} views</span>}
                      {blog.likes > 0 && <span className="text-xs text-gray-400">❤️ {blog.likes} likes</span>}
                    </div>
                    <h3 className="font-bold text-gray-800 text-lg">{blog.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{blog.excerpt || blog.content.substring(0, 120)}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>📅 {new Date(blog.created_at).toLocaleDateString()}</span>
                      {blog.published_at && <span>✅ Published: {new Date(blog.published_at).toLocaleDateString()}</span>}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => openEditModal(blog)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-sm hover:bg-blue-100">Edit</button>
                      <button onClick={() => deleteBlog(blog)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-sm hover:bg-red-100">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredBlogs.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <span className="text-5xl">📝</span>
            <p className="text-gray-400 mt-2">No blog posts found</p>
            <button onClick={openCreateModal} className="mt-4 text-blue-600 underline">Write your first post</button>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-800 mb-4">{editingBlog ? '✏️ Edit Post' : '✍️ Write New Post'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={blogForm.title} onChange={e => setBlogForm(p => ({ ...p, title: e.target.value, slug: generateSlug(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Enter post title" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                  <input type="text" value={blogForm.slug} onChange={e => setBlogForm(p => ({ ...p, slug: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="auto-generated" />
                  <p className="text-xs text-gray-400 mt-1">URL-friendly version of the title</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select value={blogForm.category} onChange={e => setBlogForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                    <option value="">Select category</option>
                    {BLOG_CATEGORIES.map(cat => (<option key={cat.value} value={cat.value}>{cat.label}</option>))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={blogForm.status} onChange={e => setBlogForm(p => ({ ...p, status: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl">
                    <option value="draft">Draft</option>
                    <option value="published">Publish Now</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                  <input type="text" value={blogForm.tags} onChange={e => setBlogForm(p => ({ ...p, tags: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="beach, surfing, adventure" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Featured Image</label>
                <MediaUpload
                  bucket="blogs"
                  folder="images"
                  mediaType="image"
                  existingMediaUrl={blogForm.featured_image}
                  onUploadComplete={(url) => setBlogForm(p => ({ ...p, featured_image: url || '' }))}
                  onUploadError={(error) => showToast(error, true)}
                  buttonText="📷 Upload Featured Image"
                  maxSizeMB={5}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt (Short Description)</label>
                <textarea value={blogForm.excerpt} onChange={e => setBlogForm(p => ({ ...p, excerpt: e.target.value }))} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-xl" placeholder="Brief summary of the post..." />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
                <textarea value={blogForm.content} onChange={e => setBlogForm(p => ({ ...p, content: e.target.value }))} rows="12" className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-sm" placeholder="Write your post content here... Supports HTML formatting" />
                <p className="text-xs text-gray-400 mt-1">You can use HTML tags for formatting (&lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;, &lt;li&gt;, etc.)</p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2 border border-gray-300 rounded-full text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveBlog} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : (editingBlog ? 'Update' : 'Publish')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className={`fixed bottom-5 right-5 px-4 py-2 rounded-full text-white text-sm z-40 ${toastMessage.isError ? 'bg-red-600' : 'bg-green-500'}`}>
          {toastMessage.isError ? '⚠️' : '✅'} {toastMessage.message}
        </div>
      )}
    </div>
  );
}
