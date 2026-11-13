'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/(subsystems)/info/components/AdminSidebar';
import { AdminPageHeader } from '@/app/(subsystems)/info/components/admin';
import { hasAdminAccess } from '@/lib/adminRoles'
import { getStoredSession } from '@/lib/authCookies';
import { notifyToast } from '@/lib/toast.mjs';

// Templates are shared by all administrators and stored server-side in
// admin_app_settings ('messaging'); defaults are used until one is saved.
const SETTINGS_API = '/info/api/admin/settings';

async function saveTemplatesToServer(templates) {
  const response = await fetch(SETTINGS_API, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'messaging', value: { templates } }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save templates.');
  return result.setting?.value?.templates || templates;
}

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = getStoredSession();
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

const DEFAULT_TEMPLATES = [
  { id: 'default-1', name: 'Event Reminder', category: 'Announcement', subject: 'Upcoming Event Reminder', body: 'Hello {{firstName}}, this is a reminder about the upcoming event in Daet. Please check the details and confirm your attendance.' },
  { id: 'default-2', name: 'Booking Follow-up', category: 'Service', subject: 'Booking Follow-Up', body: 'Hi {{firstName}}, we hope you enjoyed your visit. We would love to hear your feedback about your experience with us.' },
  { id: 'default-3', name: 'System Update', category: 'Update', subject: 'Platform Update', body: 'Hello {{firstName}}, we have rolled out a new update to improve your experience. Please review the latest changes.' },
];

const CATEGORY_OPTIONS = ['Announcement', 'Service', 'Update', 'Alert', 'Promotion'];

export default function AdminMessagingPage() {
  const router = useRouter();
  const [user] = useState(() => readStoredSession());
  const [activeTab, setActiveTab] = useState('compose');
  const [search, setSearch] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [bulkTarget, setBulkTarget] = useState('all');
  const [messageForm, setMessageForm] = useState({
    subject: '',
    category: 'Announcement',
    body: '',
    scheduleAt: '',
  });
  const [messages, setMessages] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast(null);
    notifyToast(msg, isError ? 'error' : undefined);
  };

  const loadMessagingData = async () => {
    const response = await fetch('/info/api/admin/messages', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load message data.');
    setRecipients(result.users || []);
    setMessages((result.messages || []).map((message) => ({
      ...message,
      recipientName: message.recipient?.full_name || message.recipient?.email || 'Account holder',
      sentAt: message.sent_at || message.scheduled_for || message.created_at,
      readAt: message.read_at,
      status: message.status === 'scheduled' || message.status === 'sending'
        ? 'Scheduled'
        : message.status === 'delivered'
          ? 'Sent'
          : 'Failed',
    })));
  };

  useEffect(() => {
    if (!user) {
      router.push('/info/login');
      return;
    }

    if (!hasAdminAccess(user.role)) {
      router.push('/info/admin/dashboard');
      return;
    }
    void Promise.resolve().then(() => loadMessagingData()).catch((error) => {
      console.error('Admin messaging load failed:', error);
      showToast(error.message || 'Unable to load message data.', true);
    });
  }, [router, user]);

  useEffect(() => {
    let active = true;
    fetch(SETTINGS_API, { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        const saved = result?.settings?.messaging?.templates;
        if (active && Array.isArray(saved) && saved.length) setTemplates(saved);
      })
      .catch((error) => console.error('Message templates load failed:', error));
    return () => { active = false; };
  }, []);

  const filteredMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;

    return messages.filter((message) => {
      const haystack = [message.subject, message.body, message.recipientName, message.category].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [messages, search]);

  const totals = useMemo(() => ({
    total: messages.length,
    sent: messages.filter((m) => m.status === 'Sent').length,
    scheduled: messages.filter((m) => m.status === 'Scheduled').length,
    read: messages.filter((m) => m.readAt).length,
  }), [messages]);

  const handleSendMessage = async () => {
    if (!messageForm.subject || !messageForm.body) {
      showToast('Please fill in the subject and message body.', true);
      return;
    }

    if (bulkTarget === 'group' && !selectedRecipient) {
      showToast('Choose a recipient.', true);
      return;
    }

    try {
      const response = await fetch('/info/api/admin/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allRecipients: bulkTarget === 'all',
          recipientIds: bulkTarget === 'group' ? [selectedRecipient] : undefined,
          subject: messageForm.subject,
          category: messageForm.category,
          body: messageForm.body,
          scheduleAt: messageForm.scheduleAt || null,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send message.');
      setMessageForm({ subject: '', category: 'Announcement', body: '', scheduleAt: '' });
      setSelectedRecipient('');
      setBulkTarget('all');
      showToast(result.message || 'Message delivered.');
      await loadMessagingData();
    } catch (error) {
      console.error('Admin message send failed:', error);
      showToast(error.message || 'Unable to send message.', true);
    }
  };

  const handleTemplateUse = (template) => {
    setMessageForm((prev) => ({ ...prev, subject: template.subject, category: template.category, body: template.body }));
    setActiveTab('compose');
    showToast(`Loaded ${template.name} template.`);
  };

  const saveTemplate = () => {
    if (!messageForm.subject || !messageForm.body) {
      showToast('Template needs a subject and body.', true);
      return;
    }

    const nextTemplate = {
      id: `t-${Date.now()}`,
      name: `${messageForm.category} Template`,
      category: messageForm.category,
      subject: messageForm.subject,
      body: messageForm.body,
    };

    const nextTemplates = [nextTemplate, ...templates].slice(0, 50);
    saveTemplatesToServer(nextTemplates)
      .then((saved) => {
        setTemplates(saved);
        showToast('Template saved for all administrators.');
      })
      .catch((error) => showToast(error.message || 'Unable to save the template.', true));
  };

  const handleReply = async (messageId) => {
    const target = messages.find((item) => item.id === messageId);
    if (!target) return;

    const replyText = window.prompt(`Reply to ${target.recipientName}:`);
    if (!replyText?.trim()) return;
    try {
      const response = await fetch('/info/api/admin/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replyToId: target.id,
          subject: `Re: ${target.subject}`,
          category: target.category,
          body: replyText.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to send reply.');
      showToast(result.message || 'Reply delivered.');
      await loadMessagingData();
    } catch (error) {
      console.error('Admin message reply failed:', error);
      showToast(error.message || 'Unable to send reply.', true);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Messaging Manager" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="admin-page">
        <AdminPageHeader
          eyebrow="Community"
          title="Messaging module"
          description="Send direct updates, bulk alerts, and message campaigns to users."
          icon="send"
        />

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-sm">
            <div className="text-sm text-blue-100">Total messages</div>
            <div className="mt-2 text-3xl font-bold">{totals.total}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 p-4 text-white shadow-sm">
            <div className="text-sm text-emerald-100">Sent</div>
            <div className="mt-2 text-3xl font-bold">{totals.sent}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-purple-600 p-4 text-white shadow-sm">
            <div className="text-sm text-violet-100">Scheduled</div>
            <div className="mt-2 text-3xl font-bold">{totals.scheduled}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white shadow-sm">
            <div className="text-sm text-amber-100">Read</div>
            <div className="mt-2 text-3xl font-bold">{totals.read}</div>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
          {['compose', 'history', 'templates', 'scheduled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-t-xl px-4 py-2 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab === 'compose' && 'Compose'}
              {tab === 'history' && 'Message History'}
              {tab === 'templates' && 'Templates'}
              {tab === 'scheduled' && 'Scheduled'}
            </button>
          ))}
        </div>

        {activeTab === 'compose' && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">Compose Message</h2>

              <div className="mb-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Send to</label>
                  <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    <option value="all">All users</option>
                    <option value="group">Specific users</option>
                  </select>
                </div>
                {bulkTarget === 'group' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Select recipient</label>
                    <select value={selectedRecipient} onChange={(e) => setSelectedRecipient(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                      <option value="">Choose a user</option>
                      {recipients.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.full_name || entry.email} ({entry.user_type || 'User'})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                  <select value={messageForm.category} onChange={(e) => setMessageForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Send at</label>
                  <input type="datetime-local" value={messageForm.scheduleAt} onChange={(e) => setMessageForm((prev) => ({ ...prev, scheduleAt: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Subject</label>
                <input value={messageForm.subject} onChange={(e) => setMessageForm((prev) => ({ ...prev, subject: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Enter a clear subject" />
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Message</label>
                <textarea value={messageForm.body} onChange={(e) => setMessageForm((prev) => ({ ...prev, body: e.target.value }))} rows="6" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Write your message here..." />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={handleSendMessage} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">{messageForm.scheduleAt ? 'Schedule Message' : 'Send Message'}</button>
                <button onClick={saveTemplate} className="rounded-full border border-slate-200 bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200">Save Template</button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-bold text-slate-800">Quick Template Library</h3>
              <div className="space-y-3">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">{template.name}</span>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">{template.category}</span>
                    </div>
                    <p className="mb-3 text-xs text-slate-500">{template.subject}</p>
                    <button onClick={() => handleTemplateUse(template)} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">Use template</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-800">Message History</h2>
              <div className="relative w-full max-w-sm">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, user, category..." className="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="space-y-3">
              {filteredMessages.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No messages found for this search.</p>
              ) : (
                filteredMessages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{message.subject}</p>
                        <p className="text-xs text-slate-500">To: {message.recipientName} · {new Date(message.sentAt).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">{message.category}</span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${message.status === 'Scheduled' ? 'bg-amber-100 text-amber-700' : message.status === 'Failed' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{message.status}</span>
                      </div>
                    </div>

                    <p className="mb-3 text-sm leading-6 text-slate-600">{message.body}</p>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                      <div className="flex flex-wrap gap-3">
                        <span>Read receipt: {message.readAt ? new Date(message.readAt).toLocaleString() : 'Pending'}</span>
                      </div>
                      <div className="flex gap-2">
                        {message.status === 'Sent' && <button onClick={() => handleReply(message.id)} className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Reply</button>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Message Templates</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <div key={template.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">{template.name}</p>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{template.category}</span>
                  </div>
                  <p className="mb-3 text-sm text-slate-500">{template.subject}</p>
                  <p className="line-clamp-4 text-sm leading-6 text-slate-600">{template.body}</p>
                  <button onClick={() => handleTemplateUse(template)} className="mt-4 rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-700">Use this template</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'scheduled' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-800">Scheduled Messages</h2>
            <div className="space-y-3">
              {messages.filter((message) => message.status === 'Scheduled').length === 0 ? (
                <p className="text-sm text-slate-500">No scheduled messages.</p>
              ) : (
                messages.filter((message) => message.status === 'Scheduled').map((message) => (
                  <div key={message.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-800">{message.subject}</p>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Scheduled</span>
                    </div>
                    <p className="text-sm text-slate-600">To: {message.recipientName}</p>
                    <p className="mt-2 text-xs text-slate-500">Deliver on {new Date(message.scheduled_for || message.sentAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div role={toast.isError ? 'alert' : 'status'} aria-live={toast.isError ? 'assertive' : 'polite'} className={`admin-toast ${toast.isError ? 'admin-toast-error' : 'admin-toast-success'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
