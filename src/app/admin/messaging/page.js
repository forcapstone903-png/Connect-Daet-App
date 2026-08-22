'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/app/components/AdminSidebar';
import { hasAdminAccess } from '@/lib/adminRoles';

const buildInitialMessages = () => {
  if (typeof window === 'undefined') return [];

  try {
    const savedMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.messages) || 'null');
    if (Array.isArray(savedMessages) && savedMessages.length > 0) return savedMessages;
  } catch {
    // ignore parse errors and fall back to defaults
  }

  const initialMessages = [
    {
      id: 'm-1',
      recipientId: 'u-1001',
      recipientName: 'Maria Santos',
      subject: 'Upcoming Festival Check-In',
      category: 'Announcement',
      body: 'We are excited to share the final festival schedule for this weekend.',
      status: 'Sent',
      sentAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      readAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      replies: 2,
      attachmentName: 'festival-map.pdf',
    },
    {
      id: 'm-2',
      recipientId: 'u-1004',
      recipientName: 'Daniel Reyes',
      subject: 'Operator Briefing',
      category: 'Service',
      body: 'Please review the updated tourist service response guidelines for this month.',
      status: 'Scheduled',
      sentAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      readAt: null,
      replies: 0,
      attachmentName: '',
    },
    {
      id: 'm-3',
      recipientId: 'all',
      recipientName: 'All users',
      subject: 'Maintenance Notice',
      category: 'Alert',
      body: 'The tourism portal will undergo maintenance tonight from 11:00 PM to 1:00 AM.',
      status: 'Sent',
      sentAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      readAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      replies: 8,
      attachmentName: '',
    },
  ];

  localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(initialMessages));
  return initialMessages;
};

const buildInitialTemplates = () => {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;

  try {
    const savedTemplates = JSON.parse(localStorage.getItem(STORAGE_KEYS.templates) || 'null');
    return Array.isArray(savedTemplates) && savedTemplates.length ? savedTemplates : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
};

const STORAGE_KEYS = {
  messages: 'daet_admin_messages',
  templates: 'daet_admin_message_templates',
};

const readStoredSession = () => {
  if (typeof window === 'undefined') return null;

  try {
    const session = sessionStorage.getItem('user_session');
    return session ? JSON.parse(session) : null;
  } catch {
    return null;
  }
};

const USER_LIST = [
  { id: 'u-1001', name: 'Maria Santos', role: 'Tourist' },
  { id: 'u-1002', name: 'Rico Dela Cruz', role: 'Artisan' },
  { id: 'u-1003', name: 'Alyssa Gomez', role: 'Tourist' },
  { id: 'u-1004', name: 'Daniel Reyes', role: 'Operator' },
  { id: 'u-1005', name: 'Liza Ramos', role: 'Tourist' },
];

const DEFAULT_TEMPLATES = [
  { id: 1, name: 'Event Reminder', category: 'Announcement', subject: 'Upcoming Event Reminder', body: 'Hello {{firstName}}, this is a reminder about the upcoming event in Daet. Please check the details and confirm your attendance.' },
  { id: 2, name: 'Booking Follow-up', category: 'Service', subject: 'Booking Follow-Up', body: 'Hi {{firstName}}, we hope you enjoyed your visit. We would love to hear your feedback about your experience with us.' },
  { id: 3, name: 'System Update', category: 'Update', subject: 'Platform Update', body: 'Hello {{firstName}}, we have rolled out a new update to improve your experience. Please review the latest changes.' },
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
    attachmentName: '',
  });
  const [messages, setMessages] = useState(() => buildInitialMessages());
  const [templates, setTemplates] = useState(() => buildInitialTemplates());
  const [toast, setToast] = useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!hasAdminAccess(user.role)) {
      router.push('/dashboard');
    }
  }, [router, user]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.templates, JSON.stringify(templates));
  }, [templates]);

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

  const handleSendMessage = () => {
    if (!messageForm.subject || !messageForm.body) {
      showToast('Please fill in the subject and message body.', true);
      return;
    }

    const recipients = bulkTarget === 'all' ? [{ id: 'all', name: 'All users' }] : selectedRecipient ? USER_LIST.filter((userItem) => userItem.id === selectedRecipient) : [];

    const finalRecipients = recipients.length ? recipients : [{ id: 'all', name: 'All users' }];

    const newMessages = finalRecipients.map((recipient) => ({
      id: `m-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      recipientId: recipient.id,
      recipientName: recipient.name,
      subject: messageForm.subject,
      category: messageForm.category,
      body: messageForm.body,
      status: messageForm.scheduleAt ? 'Scheduled' : 'Sent',
      sentAt: messageForm.scheduleAt ? new Date(messageForm.scheduleAt).toISOString() : new Date().toISOString(),
      readAt: messageForm.scheduleAt ? null : new Date().toISOString(),
      replies: 0,
      attachmentName: messageForm.attachmentName || '',
      scheduledFor: messageForm.scheduleAt || null,
    }));

    setMessages((prev) => [...newMessages, ...prev]);
    setMessageForm({ subject: '', category: 'Announcement', body: '', scheduleAt: '', attachmentName: '' });
    setSelectedRecipient('');
    setBulkTarget('all');
    showToast(messageForm.scheduleAt ? 'Message scheduled successfully.' : 'Message sent successfully.');
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
      id: Date.now(),
      name: `${messageForm.category} Template`,
      category: messageForm.category,
      subject: messageForm.subject,
      body: messageForm.body,
    };

    setTemplates((prev) => [nextTemplate, ...prev]);
    showToast('Template saved successfully.');
  };

  const handleReply = (messageId) => {
    const target = messages.find((item) => item.id === messageId);
    if (!target) return;

    const replyText = `Reply to: ${target.subject}\n\nThanks for your response. We will review this and follow up shortly.`;
    const newReply = {
      id: `r-${Date.now()}`,
      recipientId: target.recipientId,
      recipientName: target.recipientName,
      subject: `Re: ${target.subject}`,
      category: target.category,
      body: replyText,
      status: 'Sent',
      sentAt: new Date().toISOString(),
      readAt: new Date().toISOString(),
      replies: 0,
      attachmentName: '',
      scheduledFor: null,
    };

    setMessages((prev) => [newReply, ...prev]);
    showToast('Reply sent successfully.');
  };

  const handleReadReceipt = (messageId) => {
    setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, readAt: new Date().toISOString(), status: 'Sent' } : item));
    showToast('Read receipt recorded.');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminSidebar user={user} roleLabel="Messaging Manager" />

      <div style={{ marginLeft: 'var(--admin-sidebar-width)' }} className="p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Messaging Module</h1>
            <p className="text-sm text-slate-500">Send direct updates, bulk alerts, and message campaigns to users.</p>
          </div>
        </div>

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
                      {USER_LIST.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.name} ({entry.role})</option>
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

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">Attachment</label>
                <input type="text" value={messageForm.attachmentName} onChange={(e) => setMessageForm((prev) => ({ ...prev, attachmentName: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" placeholder="Optional attachment name or file label" />
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
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${message.status === 'Scheduled' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{message.status}</span>
                      </div>
                    </div>

                    <p className="mb-3 text-sm leading-6 text-slate-600">{message.body}</p>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                      <div className="flex flex-wrap gap-3">
                        <span>{message.attachmentName ? `Attachment: ${message.attachmentName}` : 'No attachment'}</span>
                        <span>Replies: {message.replies}</span>
                        <span>Read receipt: {message.readAt ? new Date(message.readAt).toLocaleString() : 'Pending'}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleReadReceipt(message.id)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">Mark as read</button>
                        <button onClick={() => handleReply(message.id)} className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Reply</button>
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
                    <p className="mt-2 text-xs text-slate-500">Deliver on {new Date(message.scheduledFor || message.sentAt).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
