import sgMail from '@sendgrid/mail'

const EMAIL_CONTENT = {
  requested: {
    subject: 'Your DAET CONNECT account deletion is scheduled',
    heading: 'Account deletion scheduled',
  },
  cancelled: {
    subject: 'Your DAET CONNECT account has been restored',
    heading: 'Account restored',
  },
  reminder7: {
    subject: 'Your DAET CONNECT account will be deleted in 7 days',
    heading: '7-day deletion reminder',
  },
  reminder1: {
    subject: 'Your DAET CONNECT account will be deleted tomorrow',
    heading: '1-day deletion reminder',
  },
  deleted: {
    subject: 'Your DAET CONNECT account was deleted',
    heading: 'Account permanently deleted',
  },
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function sendAccountLifecycleEmail(email, event, scheduledFor) {
  const content = EMAIL_CONTENT[event]
  if (!content) throw new Error('Unsupported account lifecycle email event.')

  const apiKey = process.env.SENDGRID_API_KEY?.trim()
  const fromEmail = process.env.SENDGRID_FROM_EMAIL?.trim()
  if (!apiKey || !fromEmail) return { sent: false, reason: 'not_configured' }

  const date = scheduledFor
    ? new Date(scheduledFor).toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
    : ''
  const message = event === 'requested'
    ? `Your account is scheduled for permanent deletion on ${date}. You can cancel this request within 30 days by signing in through the account recovery page.`
    : event === 'cancelled'
      ? 'Your account deletion request was cancelled and your account is active again.'
      : event === 'reminder7' || event === 'reminder1'
        ? `Your DAET CONNECT account is scheduled for permanent deletion on ${date}. Sign in through the account recovery page before then to cancel deletion.`
        : 'Your DAET CONNECT account and associated account data have been permanently deleted.'

  sgMail.setApiKey(apiKey)
  try {
    await sgMail.send({
      to: email,
      from: fromEmail,
      subject: content.subject,
      text: `${message}\n\nIf you did not request this change, sign in to DAET CONNECT and contact support.`,
      html: `<div style="margin:0;background:#f1f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden"><div style="padding:22px 28px;background:#2563eb;color:#fff;font-size:18px;font-weight:700;letter-spacing:.04em">DAET CONNECT</div><div style="padding:28px"><h1 style="margin:0 0 14px;font-size:22px">${content.heading}</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.6">${escapeHtml(message)}</p><p style="margin:0;color:#475569;font-size:14px;line-height:1.6">If you did not request this change, sign in to DAET CONNECT and contact support.</p></div><div style="padding:16px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">This is an automated account notification. Please do not reply.</div></div></div>`,
    })
    return { sent: true }
  } catch (error) {
    console.error('Account lifecycle email delivery failed:', {
      event,
      code: error.code || null,
      status: error.response?.statusCode || null,
    })
    return { sent: false, reason: 'delivery_failed' }
  }
}
