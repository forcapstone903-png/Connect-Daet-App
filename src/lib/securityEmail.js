import sgMail from '@sendgrid/mail'
import { getEmailSender } from './emailSettings'

const EMAIL_CONTENT = {
  changed: {
    subject: 'Your DAET CONNECT password was changed',
    heading: 'Password changed',
    message: 'The password for your DAET CONNECT account was changed successfully.',
  },
  reset: {
    subject: 'Your DAET CONNECT password was reset',
    heading: 'Password reset complete',
    message: 'The password for your DAET CONNECT account was reset successfully.',
  },
}

export async function sendPasswordSecurityEmail(email, event) {
  const content = EMAIL_CONTENT[event]
  if (!content) throw new Error('Unsupported password security email event.')

  const sender = await getEmailSender()
  if (!sender.configured) return { sent: false, reason: 'not_configured' }
  if (!sender.settings.security_emails_enabled) return { sent: false, reason: 'disabled' }

  sgMail.setApiKey(sender.apiKey)

  try {
    await sgMail.send({
      to: email,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: content.subject,
      text: `${content.message} If you did not make this change, contact DAET CONNECT support immediately.${sender.footerText}`,
      html: `<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden"><div style="padding:22px 28px;background:#2563eb;color:#fff;font-size:18px;font-weight:700;letter-spacing:.04em">DAET CONNECT</div><div style="padding:28px"><h1 style="margin:0 0 14px;font-size:22px">${content.heading}</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.6">${content.message}</p><p style="margin:0;color:#475569;font-size:14px;line-height:1.6">If you did not make this change, contact DAET CONNECT support immediately and secure your account.</p></div><div style="padding:16px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">This is an automated security notification.${sender.footerHtml}</div></div></div>`,
    })
    return { sent: true }
  } catch (error) {
    console.error('Password security email delivery failed:', {
      event,
      code: error.code || null,
      status: error.response?.statusCode || null,
    })
    return { sent: false, reason: 'delivery_failed' }
  }
}
