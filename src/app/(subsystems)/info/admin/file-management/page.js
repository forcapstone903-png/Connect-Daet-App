'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminPageHeader, AdminStatCard, AdminStatGrid } from '@/app/(subsystems)/info/components/admin';
import { hasAdminAccess } from '@/lib/adminRoles';
import { getStoredSession } from '@/lib/authCookies';

const MEDIA_API = '/info/api/admin/media';

function readStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    const session = getStoredSession();
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`The server returned an invalid response (${response.status}).`);
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return 'Size unavailable';
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function FileManagementPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('All');
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, isError = false) => {
    setToast({ message, isError });
    window.setTimeout(() => setToast(null), 5000);
  }, []);

  const loadFiles = useCallback(async () => {
    try {
      const response = await fetch(MEDIA_API, { cache: 'no-store' });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to load media (${response.status}).`);
      }
      setFiles(data.files || []);
    } catch (error) {
      showToast(error.message || 'Unable to load media.', true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // Resolve the browser-held session after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(readStoredSession());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.push('/info/login');
      return;
    }
    if (!hasAdminAccess(user.role)) {
      router.push('/info/admin/dashboard');
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(MEDIA_API, { cache: 'no-store' });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Unable to load media (${response.status}).`);
        }
        if (active) setFiles(data.files || []);
      } catch (error) {
        if (active) showToast(error.message || 'Unable to load media.', true);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [isHydrated, router, showToast, user]);

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return files.filter((file) => {
      const matchesSearch = !query || [file.name, file.type, file.objectPath].join(' ').toLowerCase().includes(query);
      const matchesKind = kind === 'All' || (kind === 'Images' ? file.type.startsWith('image/') : file.type.startsWith('video/'));
      return matchesSearch && matchesKind;
    });
  }, [files, kind, search]);

  const uploadFiles = async (incoming) => {
    const selected = Array.from(incoming || []);
    if (!selected.length) return;

    setUploading(true);
    let uploaded = 0;
    const failures = [];
    for (const file of selected) {
      try {
        const formData = new FormData();
        formData.set('file', file);
        const response = await fetch(MEDIA_API, { method: 'POST', body: formData });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) {
          throw new Error(data.message || `Upload failed (${response.status}).`);
        }
        uploaded += 1;
      } catch (error) {
        failures.push(`${file.name}: ${error.message || 'upload failed'}`);
      }
    }
    if (uploaded) await loadFiles();
    setUploading(false);

    if (failures.length) {
      showToast(`${uploaded} file(s) uploaded; ${failures.length} failed. ${failures.slice(0, 2).join(' ')}`, true);
    } else {
      showToast(`${uploaded} file(s) uploaded to shared storage.`);
    }
  };

  const deleteFile = async (file) => {
    try {
      const response = await fetch(MEDIA_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectPath: file.objectPath }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || `Unable to delete media (${response.status}).`);
      }
      setFiles((current) => current.filter((entry) => entry.objectPath !== file.objectPath));
      showToast('Media object deleted from storage.');
    } catch (error) {
      showToast(error.message || 'Unable to delete media.', true);
    }
  };

  const totalBytes = files.reduce((total, file) => total + (Number(file.size) || 0), 0);

  if (!isHydrated || !user) {
    return (
      <div className="min-h-screen bg-slate-50" aria-busy="true">
        <div className="admin-loading"><span className="admin-loading-ring" aria-hidden="true" /><p className="text-sm">Loading media library…</p></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="File Manager" />
      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Content"
          title="Media library"
          description="Manage administrator uploads stored in Supabase Storage."
          icon="image"
        />

        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Uploads are durably stored in the public media bucket and can be viewed by anyone with the URL. Upload only approved public-site images or videos; upload and delete operations require an administrator session. Automatic image optimization is not available.
        </div>

        <AdminStatGrid>
          <AdminStatCard label="Files" value={files.length} icon="data" tone="info" meta="Tracked administrator uploads" />
          <AdminStatCard label="Images" value={files.filter((file) => file.type.startsWith('image/')).length} icon="image" tone="violet" meta="Stored image assets" />
          <AdminStatCard label="Videos" value={files.filter((file) => file.type.startsWith('video/')).length} icon="events" tone="brand" meta="Stored video assets" />
          <AdminStatCard label="Tracked size" value={formatSize(totalBytes)} icon="save" tone="success" meta="Size recorded at upload time" />
        </AdminStatGrid>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search uploaded files" className="min-w-[220px] flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            <select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
              <option>All</option>
              <option>Images</option>
              <option>Videos</option>
            </select>
            <label className={`cursor-pointer rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : 'Upload media'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" multiple className="sr-only" disabled={uploading} onChange={(event) => { uploadFiles(event.target.files); event.target.value = ''; }} />
            </label>
            <button type="button" onClick={() => { setLoading(true); loadFiles(); }} disabled={loading} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {loading && files.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading stored media…</p>
          ) : filteredFiles.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFiles.map((file) => (
                <article key={file.objectPath} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="truncate font-semibold text-slate-800" title={file.name}>{file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{file.type} · {formatSize(Number(file.size))}</p>
                  <p className="mt-1 text-xs text-slate-500">Uploaded {new Date(file.uploadedAt).toLocaleString()}</p>
                  <div className="mt-4 flex gap-2">
                    <a href={file.url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-slate-200 hover:bg-blue-50">Open file</a>
                    <button type="button" onClick={() => deleteFile(file)} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-slate-500">{files.length ? 'No files match your search.' : 'No administrator media uploads have been recorded.'}</p>
          )}
        </section>
      </div>

      {toast && (
        <div role={toast.isError ? 'alert' : 'status'} className={`fixed bottom-5 right-5 max-w-xl rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.isError ? 'bg-red-700' : 'bg-emerald-700'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
