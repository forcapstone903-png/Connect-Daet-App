'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles';

const STORAGE_KEY = 'daet_file_library';

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = sessionStorage.getItem('user_session');
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

const defaultFiles = [
  { id: 1, name: 'bagasbas-banner.jpg', type: 'image/jpeg', category: 'Marketing', size: '1.2 MB', uploadedAt: '2026-08-01', folder: 'Campaigns', optimized: true, previewUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80' },
  { id: 2, name: 'event-guide.pdf', type: 'application/pdf', category: 'Documents', size: '842 KB', uploadedAt: '2026-08-04', folder: 'Reports', optimized: false, previewUrl: '' },
  { id: 3, name: 'heritage-video.mp4', type: 'video/mp4', category: 'Media', size: '8.6 MB', uploadedAt: '2026-08-06', folder: 'Videos', optimized: true, previewUrl: '' },
  { id: 4, name: 'plaza-rizal.png', type: 'image/png', category: 'Places', size: '2.4 MB', uploadedAt: '2026-08-08', folder: 'Tourism Spots', optimized: true, previewUrl: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80' },
];

export default function FileManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [files, setFiles] = useState(() => {
    if (typeof window === 'undefined') return defaultFiles;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return Array.isArray(saved) && saved.length > 0 ? saved : defaultFiles;
    } catch {
      return defaultFiles;
    }
  });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    // Browser-only session hydration is required here to avoid mismatch between
    // server and client renders. The page intentionally renders a skeleton until
    // the client has resolved the authenticated user.
    const sessionUser = readStoredSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(sessionUser);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasAdminAccess(user.role)) {
      router.push('/dashboard');
    }
  }, [router, user, isHydrated]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  }, [files]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((file) => {
      const matchesSearch = !q || [file.name, file.type, file.category, file.folder].join(' ').toLowerCase().includes(q);
      const matchesCategory = category === 'All' || file.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [category, files, search]);

  const totalSize = useMemo(() => {
    const sizeMap = {
      KB: 1024,
      MB: 1024 * 1024,
      GB: 1024 * 1024 * 1024,
    };

    return files.reduce((sum, file) => {
      const match = file.size.match(/([0-9.]+)\s*([KMG]?B)/i);
      if (!match) return sum;
      const value = Number(match[1]);
      const unit = match[2].toUpperCase();
      return sum + value * (sizeMap[unit] || 1);
    }, 0);
  }, [files]);

  const storagePercent = Math.min((totalSize / (20 * 1024 * 1024)) * 100, 100);

  const handleFiles = (incomingFiles) => {
    const list = Array.from(incomingFiles).map((file, index) => ({
      id: Date.now() + index,
      name: file.name,
      type: file.type || 'application/octet-stream',
      category: file.type.startsWith('image/') ? 'Marketing' : 'Documents',
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      uploadedAt: new Date().toISOString().split('T')[0],
      folder: 'Uploads',
      optimized: file.type.startsWith('image/'),
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }));

    setFiles((prev) => [...list, ...prev]);
    showToast(`${list.length} file(s) uploaded.`);
  };

  const handleDelete = (fileId) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    if (selectedFile && selectedFile.id === fileId) setSelectedFile(null);
    showToast('File deleted.');
  };

  const toggleOptimization = (fileId) => {
    setFiles((prev) => prev.map((item) => item.id === fileId ? { ...item, optimized: !item.optimized } : item));
    showToast('Image optimization updated.');
  };

  const imageActions = (file) => {
    if (!file || !file.previewUrl) return;
    return (
      <div className="flex gap-2">
        <button onClick={() => setSelectedFile(file)} className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700">Preview</button>
        <button onClick={() => toggleOptimization(file.id)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">{file.optimized ? 'Optimize on' : 'Optimize off'}</button>
      </div>
    );
  };

  const categories = ['All', ...new Set(files.map((file) => file.category))];

  if (!isHydrated || !user) {
    return (
      <div className="min-h-screen bg-slate-50" aria-busy="true">
        <div className="ml-64 p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-72 rounded bg-slate-200" />
            <div className="grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 rounded-2xl bg-slate-200" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="File Manager" />

      <div className="ml-64 p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">File Management</h1>
            <p className="text-sm text-slate-500">Media library, uploads, previews, and storage optimization.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-r from-sky-600 to-cyan-600 p-4 text-white shadow-sm">
            <div className="text-sm text-sky-100">Files</div>
            <div className="mt-2 text-3xl font-bold">{files.length}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 p-4 text-white shadow-sm">
            <div className="text-sm text-violet-100">Images</div>
            <div className="mt-2 text-3xl font-bold">{files.filter((file) => file.type.startsWith('image/')).length}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 p-4 text-white shadow-sm">
            <div className="text-sm text-emerald-100">Storage</div>
            <div className="mt-2 text-3xl font-bold">{(totalSize / (1024 * 1024)).toFixed(1)} MB</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-sm">
            <div className="text-sm text-amber-100">Used</div>
            <div className="mt-2 text-3xl font-bold">{storagePercent.toFixed(0)}%</div>
          </div>
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-md">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files by name, type, or folder" className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {categories.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <label
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
              className={`mb-5 flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
            >
              <input type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              <div>
                <div className="text-2xl">Upload</div>
                <p className="mt-2 text-sm font-medium text-slate-700">Drag and drop files here or click to upload</p>
              </div>
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredFiles.map((file) => (
                <div key={file.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 overflow-hidden rounded-xl bg-white">
                    {file.previewUrl ? (
                      <Image src={file.previewUrl} alt={file.name} width={500} height={220} className="h-32 w-full object-cover" />
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-slate-200 text-sm text-gray-600">{file.type.includes('pdf') ? 'PDF' : file.type.includes('video') ? 'Video' : 'File'}</div>
                    )}
                  </div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">{file.category}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    <p>{file.folder}</p>
                    <p>{file.size}</p>
                    <p>{file.uploadedAt}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {imageActions(file)}
                    <button onClick={() => handleDelete(file.id)} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-lg font-bold text-slate-800">Storage Usage</h3>
              <div className="mb-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${storagePercent}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>20 MB limit</span>
                <span>{(totalSize / (1024 * 1024)).toFixed(1)} MB used</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-lg font-bold text-slate-800">Folders</h3>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span>Campaigns</span><span>4</span></div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span>Reports</span><span>2</span></div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span>Tourism Spots</span><span>5</span></div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"><span>Videos</span><span>3</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">File Preview</h3>
              <button onClick={() => setSelectedFile(null)} className="text-sm text-slate-400 hover:text-slate-600">Close</button>
            </div>

            {selectedFile.previewUrl ? (
              <Image src={selectedFile.previewUrl} alt={selectedFile.name} width={1200} height={900} className="max-h-[60vh] w-full rounded-2xl object-contain" />
              ) : (
              <div className="flex h-64 items-center justify-center rounded-2xl bg-slate-100 text-sm text-gray-600">File</div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Name</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedFile.name}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Type</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedFile.type}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Uploaded</p><p className="mt-1 text-sm font-medium text-slate-800">{selectedFile.uploadedAt}</p></div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
