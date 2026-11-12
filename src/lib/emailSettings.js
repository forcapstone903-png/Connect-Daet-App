import { getAppSetting } from './appSettingsServer'

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

/**
 * Sender details for SendGrid. The API key and verified from-address stay in
 * server environment variables; Settings -> Email controls the display name,
 * reply-to, footer and which optional emails are sent.
 */
export async function getEmailSender() {
  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim()
  const settings = await getAppSetting('email')
  return {
    configured: Boolean(apiKey && fromEmail),
    apiKey,
    from: fromEmail ? { email: fromEmail, name: settings.sender_name } : null,
    replyTo: settings.reply_to || undefined,
    settings,
    footerText: settings.footer_text ? `\n\n${settings.footer_text}` : '',
    footerHtml: settings.footer_text
      ? `<p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.5">${escapeHtml(settings.footer_text)}</p>`
      : '',
  }
}
